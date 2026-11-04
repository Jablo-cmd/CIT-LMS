import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { allowRoles } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import { calculateWorkingLeaveDays } from "../services/leave-calculation.js";
import { toDocumentView } from "../services/document-view.js";

export const leaveRouter = Router();
const allStaff = allowRoles("COMPANY_OWNER", "HR_MANAGER", "ADMIN_PERSONNEL");
const hrOnly = allowRoles("COMPANY_OWNER", "HR_MANAGER");
const policySchema = z.object({
  category: z.enum(["ANNUAL","SICK","FAMILY_RESPONSIBILITY","MATERNITY","PATERNITY_PARENTAL","UNPAID","STUDY","OTHER"]),
  name: z.string().trim().min(2).max(100),
  entitlementDays: z.number().nonnegative().optional(),
  accrualPerMonth: z.number().nonnegative().optional(),
  employmentType: z.enum(["PERMANENT","CONTRACT"]).optional(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  carryOverLimit: z.number().nonnegative().optional(),
  eligibility: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional()
}).refine(v => !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, { path: ["effectiveTo"], message: "Effective-to date must not precede effective-from date" });

leaveRouter.get("/policies", hrOnly, async (_req, res, next) => {
  try {
    const policies = await prisma.leavePolicy.findMany({ orderBy: [{ category: "asc" }, { effectiveFrom: "desc" }] });
    return res.json({ items: policies });
  } catch (e) { return next(e); }
});


leaveRouter.patch("/policies/:id", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ effectiveTo: z.coerce.date() }).parse(req.body);
    const policy = await prisma.leavePolicy.findUnique({ where: { id: String(req.params.id) } });
    if (!policy) return res.status(404).json({ error: "Leave policy not found" });
    if (input.effectiveTo < policy.effectiveFrom) return res.status(400).json({ error: "Policy end date cannot precede its start date" });
    const latestLeave = await prisma.leaveTransaction.findFirst({
      where: { policyId: policy.id, lastLeaveDate: { not: null } },
      orderBy: { lastLeaveDate: "desc" },
      select: { lastLeaveDate: true }
    });
    if (latestLeave?.lastLeaveDate && input.effectiveTo < latestLeave.lastLeaveDate) return res.status(409).json({ error: "Policy cannot end before leave already recorded against it" });
    const updated = await prisma.leavePolicy.update({ where: { id: policy.id }, data: { effectiveTo: input.effectiveTo } });
    await writeAudit(req, "CLOSE_LEAVE_POLICY_PERIOD", "LeavePolicy", updated.id, policy, updated);
    return res.json({ policy: updated });
  } catch(e){return next(e);}
});

leaveRouter.post("/policies", hrOnly, async (req, res, next) => {
  try {
    const input = policySchema.parse(req.body);
    const existingPolicies = await prisma.leavePolicy.findMany({ where: { category: input.category, employmentType: input.employmentType ?? null } });
    const overlaps = existingPolicies.some(existing => (!existing.effectiveTo || existing.effectiveTo >= input.effectiveFrom) && (!input.effectiveTo || existing.effectiveFrom <= input.effectiveTo));
    if (overlaps) return res.status(409).json({ error: "This policy period overlaps an existing active policy for the same leave category and employment type. Close the previous period first." });
    const policy = await prisma.leavePolicy.create({ data: { ...input, createdById: req.auth!.userId } });
    await writeAudit(req, "CREATE", "LeavePolicy", policy.id, undefined, policy);
    return res.status(201).json({ policy });
  } catch (e) { return next(e); }
});

leaveRouter.post("/calculate", allStaff, async (req, res, next) => {
  try {
    const input = z.object({ employeeId: z.string().min(1), firstLeaveDate: z.coerce.date(), lastLeaveDate: z.coerce.date() }).parse(req.body);
    const days = await calculateWorkingLeaveDays(input.employeeId, input.firstLeaveDate, input.lastLeaveDate);
    return res.json({ workingDays: days, calendar: "Employee schedule, excluding configured South African public holidays" });
  } catch (e) { return next(e); }
});


leaveRouter.post("/accruals/run", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }).parse(req.body);
    const monthStart = new Date(Date.UTC(input.year, input.month - 1, 1));
    const monthEnd = new Date(Date.UTC(input.year, input.month, 0, 23, 59, 59, 999));
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: "ACTIVE", originalHireDate: { lte: monthEnd }, OR: [{ contractEndDate: null }, { contractEndDate: { gte: monthStart } }] }
    });
    const policies = (await prisma.leavePolicy.findMany({
      where: { effectiveFrom: { lte: monthEnd }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }] }
    })).sort((a,b) => Number(!!b.employmentType)-Number(!!a.employmentType) || b.effectiveFrom.getTime()-a.effectiveFrom.getTime());
    const results: Array<{employeeId:string;category:string;days:number;transactionId:string}> = [];
    for (const employee of employees) {
      const latestByCategory = new Map<string, typeof policies[number]>();
      for (const policy of policies) {
        if (policy.employmentType && policy.employmentType !== employee.employmentType) continue;
        if (!latestByCategory.has(policy.category)) latestByCategory.set(policy.category, policy);
      }
      for (const policy of latestByCategory.values()) {
        if (policy.category === "UNPAID") continue;
        const monthlyRate = policy.accrualPerMonth ? Number(policy.accrualPerMonth) : policy.entitlementDays ? Number(policy.entitlementDays) / 12 : 0;
        const employeeStart = employee.contractStartDate && employee.contractStartDate > employee.originalHireDate ? employee.contractStartDate : employee.originalHireDate;
        const periodStart = new Date(Math.max(monthStart.getTime(), policy.effectiveFrom.getTime(), employeeStart.getTime()));
        const endCandidates = [monthEnd, ...(policy.effectiveTo ? [policy.effectiveTo] : []), ...(employee.contractEndDate ? [employee.contractEndDate] : [])];
        const periodEnd = new Date(Math.min(...endCandidates.map(d => d.getTime())));
        if (monthlyRate <= 0 || periodEnd < periodStart) continue;
        const daysInMonth = new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
        const coveredDays = Math.floor((Date.UTC(periodEnd.getUTCFullYear(),periodEnd.getUTCMonth(),periodEnd.getUTCDate())-Date.UTC(periodStart.getUTCFullYear(),periodStart.getUTCMonth(),periodStart.getUTCDate()))/86400000)+1;
        const days = Math.round(monthlyRate * coveredDays / daysInMonth * 100) / 100;
        if (days <= 0) continue;
        const referenceNumber = `ACCRUAL-${input.year}-${String(input.month).padStart(2,"0")}-${employee.id}-${policy.id}`;
        const existing = await prisma.leaveTransaction.findFirst({ where: { employeeId: employee.id, category: policy.category, referenceNumber } });
        if (existing) continue;
        const transaction = await prisma.$transaction(async tx => {
          const ledger = await tx.leaveTransaction.findMany({ where: { employeeId: employee.id, category: policy.category } });
          const balance = ledger.reduce((total, row) => total + (row.transactionType === "DEDUCTION" ? -Number(row.days) : Number(row.days)), 0);
          return tx.leaveTransaction.create({
            data: { employeeId: employee.id, policyId: policy.id, category: policy.category, transactionType: "ADJUSTMENT", days, balanceAfter: balance + days, notes: `Monthly policy accrual for ${input.year}-${String(input.month).padStart(2,"0")}`, referenceNumber, capturedById: req.auth!.userId }
          });
        }, { isolationLevel: "Serializable" });
        results.push({ employeeId: employee.id, category: policy.category, days, transactionId: transaction.id });
      }
    }
    await writeAudit(req, "RUN_MONTHLY_LEAVE_ACCRUAL", "LeaveTransaction", undefined, undefined, { year: input.year, month: input.month, entriesCreated: results.length });
    return res.json({ year: input.year, month: input.month, entriesCreated: results.length, entries: results });
  } catch(e){return next(e);}
});



leaveRouter.post("/carryover/apply", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ year: z.number().int().min(2000).max(2100) }).parse(req.body);
    const currentYear = new Date().getUTCFullYear();
    if (input.year >= currentYear) return res.status(400).json({ error: "Carry-over can only be applied after the leave year has closed" });
    const yearEndDate = new Date(Date.UTC(input.year, 11, 31));
    const cutoff = new Date(Date.UTC(input.year, 11, 31, 23, 59, 59, 999));
    const employees = await prisma.employee.findMany({
      where: {
        employmentStatus: "ACTIVE", originalHireDate: { lte: cutoff },
        OR: [{ contractStartDate: null }, { contractStartDate: { lte: cutoff } }],
        AND: [{ OR: [{ contractEndDate: null }, { contractEndDate: { gte: yearEndDate } }] }]
      }
    });
    const policies = (await prisma.leavePolicy.findMany({
      where: {
        category: { not: "UNPAID" }, carryOverLimit: { not: null },
        effectiveFrom: { lte: yearEndDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: yearEndDate } }]
      }
    })).sort((a,b) => Number(!!b.employmentType)-Number(!!a.employmentType) || b.effectiveFrom.getTime()-a.effectiveFrom.getTime());
    const created: Array<{employeeId:string;category:string;days:number;transactionId:string}> = [];
    for (const employee of employees) {
      const latestByCategory = new Map<string, typeof policies[number]>();
      for (const policy of policies) {
        if (policy.employmentType && policy.employmentType !== employee.employmentType) continue;
        if (!latestByCategory.has(policy.category)) latestByCategory.set(policy.category, policy);
      }
      for (const policy of latestByCategory.values()) {
        const limit = Number(policy.carryOverLimit);
        const referenceNumber = `CARRYOVER-${input.year}-${employee.id}-${policy.id}`;
        const existing = await prisma.leaveTransaction.findFirst({ where: { employeeId:employee.id, category:policy.category, referenceNumber } });
        if (existing) continue;
        const ledger = await prisma.leaveTransaction.findMany({
          where: { employeeId:employee.id, category:policy.category, capturedAt:{ lte:cutoff } }
        });
        const balance = ledger.reduce((total,row)=>total+(row.transactionType==="DEDUCTION"?-Number(row.days):Number(row.days)),0);
        if (balance <= limit) continue;
        const adjustmentDays = Math.round((limit-balance)*100)/100;
        const transaction = await prisma.$transaction(async tx => tx.leaveTransaction.create({
          data: {
            employeeId:employee.id, policyId:policy.id, category:policy.category,
            transactionType:"ADJUSTMENT", days:adjustmentDays,
            balanceAfter:limit, notes:`Year-end ${input.year} carry-over cap applied (maximum ${limit} days)`,
            referenceNumber, capturedById:req.auth!.userId
          }
        }), { isolationLevel:"Serializable" });
        created.push({employeeId:employee.id,category:policy.category,days:adjustmentDays,transactionId:transaction.id});
      }
    }
    await writeAudit(req,"APPLY_LEAVE_CARRYOVER_CAP","LeaveTransaction",undefined,undefined,{year:input.year,entriesCreated:created.length});
    return res.json({year:input.year,entriesCreated:created.length,entries:created,cutoff:cutoff.toISOString()});
  }catch(e){return next(e);}
});

leaveRouter.get("/balances", allStaff, async (req, res, next) => {
  try {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const employees = await prisma.employee.findMany({
      where: employeeId ? { id: employeeId } : {},
      select: { id:true, employeeNumber:true, firstName:true, lastName:true, employmentStatus:true },
      orderBy: [{ lastName:"asc" },{ firstName:"asc" }], take:1000
    });
    const ids = employees.map(e=>e.id);
    const transactions = await prisma.leaveTransaction.findMany({
      where: { employeeId: { in: ids } },
      select: { employeeId:true, category:true, transactionType:true, days:true }
    });
    const balances = new Map<string,Record<string,number>>();
    for(const transaction of transactions){
      if(transaction.category==="UNPAID") continue;
      const current=balances.get(transaction.employeeId)??{};
      current[transaction.category]=(current[transaction.category]??0)+(transaction.transactionType==="DEDUCTION"?-Number(transaction.days):Number(transaction.days));
      balances.set(transaction.employeeId,current);
    }
    return res.json({items:employees.map(employee=>({employee,balances:balances.get(employee.id)??{}}))});
  }catch(e){return next(e);}
});

leaveRouter.get("/balances/:employeeId", allStaff, async (req, res, next) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: String(req.params.employeeId) }, select: { id: true, employeeNumber: true, firstName: true, lastName: true } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    const rows = await prisma.leaveTransaction.findMany({ where: { employeeId: employee.id }, orderBy: { capturedAt: "asc" } });
    const balances = new Map<string, number>();
    for (const row of rows) {
      const key = row.category;
      if (key === "UNPAID") continue;
      const previous = balances.get(key) ?? 0;
      const days = Number(row.days);
      const next = row.transactionType === "DEDUCTION" ? previous - days : previous + days;
      balances.set(key, next);
    }
    return res.json({ employee, balances: Object.fromEntries(balances) });
  } catch (e) { return next(e); }
});

leaveRouter.get("/transactions", allStaff, async (req, res, next) => {
  try {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const items = await prisma.leaveTransaction.findMany({
      where: { ...(employeeId ? { employeeId } : {}), ...(category ? { category: category as never } : {}) },
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } }, capturedBy: { select: { fullName: true } } },
      orderBy: { capturedAt: "desc" }, take: 500
    });
    return res.json({ items: items.map(item => ({ ...item, documents: "documents" in item ? item.documents.map(toDocumentView) : undefined })) });
  } catch (e) { return next(e); }
});

leaveRouter.post("/transactions", allStaff, async (req, res, next) => {
  try {
    const input = z.object({
      employeeId: z.string().min(1),
      category: z.enum(["ANNUAL","SICK","FAMILY_RESPONSIBILITY","MATERNITY","PATERNITY_PARENTAL","UNPAID","STUDY","OTHER"]),
      firstLeaveDate: z.coerce.date(),
      lastLeaveDate: z.coerce.date(),
      paperFormDate: z.coerce.date().optional(),
      reason: z.string().max(2000).optional(),
      referenceNumber: z.string().max(100).optional(),
      supportingDocumentId: z.string().min(1)
    }).parse(req.body);
    const days = await calculateWorkingLeaveDays(input.employeeId, input.firstLeaveDate, input.lastLeaveDate);
    if (days < 1) return res.status(400).json({ error: "The selected dates contain no scheduled working days" });
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    const supportingDocument = await prisma.employeeDocument.findFirst({ where: { id: input.supportingDocumentId, employeeId: employee.id, leaveTransactionId: null, overtimeEntryId: null, disciplinaryRecordId: null, recommendationId: null, historyEvent: null } });
    if (!supportingDocument) return res.status(400).json({ error: "A supporting leave form belonging to this employee is required" });
    const policyCandidates = input.category === "UNPAID" ? [] : await prisma.leavePolicy.findMany({
      where: {
        category: input.category,
        effectiveFrom: { lte: input.firstLeaveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.lastLeaveDate } }],
        AND: [{ OR: [{ employmentType: null }, { employmentType: employee.employmentType }] }]
      }
    });
    const policy = policyCandidates.sort((a,b) => Number(b.employmentType === employee.employmentType)-Number(a.employmentType === employee.employmentType) || b.effectiveFrom.getTime()-a.effectiveFrom.getTime())[0] ?? null;
    if (input.category !== "UNPAID" && !policy) return res.status(409).json({ error: "No active leave policy covers the selected dates and employee type" });

    const transaction = await prisma.$transaction(async tx => {
      const ledger = await tx.leaveTransaction.findMany({ where: { employeeId: input.employeeId, category: input.category }, orderBy: { capturedAt: "asc" } });
      const balance = ledger.reduce((total, row) => total + (row.transactionType === "DEDUCTION" ? -Number(row.days) : Number(row.days)), 0);
      if (input.category !== "UNPAID" && balance < days) throw new Error("INSUFFICIENT_LEAVE_BALANCE");
      const created = await tx.leaveTransaction.create({
        data: {
          employeeId: input.employeeId, policyId: policy?.id, category: input.category,
          transactionType: "DEDUCTION", firstLeaveDate: input.firstLeaveDate, lastLeaveDate: input.lastLeaveDate,
          paperFormDate: input.paperFormDate, days,
          balanceAfter: input.category === "UNPAID" ? null : balance - days, notes: input.reason, referenceNumber: input.referenceNumber,
          capturedById: req.auth!.userId
        }
      });
      await tx.employeeDocument.update({
        where: { id: supportingDocument.id },
        data: { leaveTransactionId: created.id }
      });
      return tx.leaveTransaction.findUniqueOrThrow({
        where: { id: created.id },
        include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } }, documents: { select: { id:true, title:true, category:true, storagePath:true, mimeType:true, createdAt:true } } }
      });
    }, { isolationLevel: "Serializable" });
    await writeAudit(req, "CREATE", "LeaveTransaction", transaction.id, undefined, transaction);
    return res.status(201).json({ transaction: { ...transaction, documents: transaction.documents.map(toDocumentView) }, calculatedWorkingDays: days });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_LEAVE_BALANCE") return res.status(409).json({ error: "Insufficient leave balance. Record an authorised opening balance or adjustment first." });
    return next(e);
  }
});


leaveRouter.post("/balances/:employeeId/adjust", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({
      category: z.enum(["ANNUAL","SICK","FAMILY_RESPONSIBILITY","MATERNITY","PATERNITY_PARENTAL","UNPAID","STUDY","OTHER"]),
      days: z.number().refine(v => v !== 0),
      reason: z.string().trim().min(5).max(2000)
    }).parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { id: String(req.params.employeeId) } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    const transaction = await prisma.$transaction(async tx => {
      const ledger = await tx.leaveTransaction.findMany({ where: { employeeId: employee.id, category: input.category } });
      const balance = ledger.reduce((total, row) => total + (row.transactionType === "DEDUCTION" ? -Number(row.days) : Number(row.days)), 0);
      return tx.leaveTransaction.create({
        data: { employeeId: employee.id, category: input.category, transactionType: "ADJUSTMENT", days: input.days, balanceAfter: balance + input.days, notes: input.reason, capturedById: req.auth!.userId }
      });
    }, { isolationLevel: "Serializable" });
    await writeAudit(req, "LEAVE_BALANCE_ADJUSTMENT", "LeaveTransaction", transaction.id, undefined, transaction);
    return res.status(201).json({ transaction });
  } catch (e) { return next(e); }
});


leaveRouter.post("/transactions/:id/reverse", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().min(5).max(2000) }).parse(req.body);
    const original = await prisma.leaveTransaction.findUnique({ where: { id: String(req.params.id) } });
    if (!original) return res.status(404).json({ error: "Leave transaction not found" });
    if (original.transactionType === "REVERSAL" || original.transactionType === "VOID") return res.status(400).json({ error: "A reversal or void transaction cannot itself be reversed" });
    const referenceNumber = `REVERSAL-${original.id}`;
    const existing = await prisma.leaveTransaction.findFirst({ where: { employeeId: original.employeeId, category: original.category, referenceNumber } });
    if (existing) return res.status(409).json({ error: "This leave transaction has already been reversed" });
    const reversalDays = original.transactionType === "DEDUCTION" ? Number(original.days) : -Number(original.days);
    const reversal = await prisma.$transaction(async tx => {
      const ledger = await tx.leaveTransaction.findMany({ where: { employeeId: original.employeeId, category: original.category } });
      const balance = ledger.reduce((total, row) => total + (row.transactionType === "DEDUCTION" ? -Number(row.days) : Number(row.days)), 0);
      return tx.leaveTransaction.create({
        data: { employeeId: original.employeeId, category: original.category, transactionType: "REVERSAL", reversesId: original.id, days: reversalDays, balanceAfter: balance + reversalDays, notes: input.reason, referenceNumber, capturedById: req.auth!.userId }
      });
    }, { isolationLevel: "Serializable" });
    await writeAudit(req, "REVERSE_LEAVE_TRANSACTION", "LeaveTransaction", reversal.id, original, reversal);
    return res.status(201).json({ transaction: reversal });
  } catch(e){return next(e);}
});

leaveRouter.post("/transactions/:id/adjust", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ days: z.number().refine(v => v !== 0), reason: z.string().trim().min(5).max(2000) }).parse(req.body);
    const original = await prisma.leaveTransaction.findUnique({ where: { id: String(req.params.id) } });
    if (!original) return res.status(404).json({ error: "Leave transaction not found" });
    const transaction = await prisma.$transaction(async tx => {
      const ledger = await tx.leaveTransaction.findMany({ where: { employeeId: original.employeeId, category: original.category } });
      const balance = ledger.reduce((total, row) => total + (row.transactionType === "DEDUCTION" ? -Number(row.days) : Number(row.days)), 0);
      const adjustment = await tx.leaveTransaction.create({
        data: { employeeId: original.employeeId, category: original.category, transactionType: "ADJUSTMENT", days: input.days, balanceAfter: balance + input.days, notes: input.reason, referenceNumber: original.id, capturedById: req.auth!.userId }
      });
      return adjustment;
    }, { isolationLevel: "Serializable" });
    await writeAudit(req, "ADJUST", "LeaveTransaction", transaction.id, undefined, transaction);
    return res.status(201).json({ transaction });
  } catch (e) { return next(e); }
});
