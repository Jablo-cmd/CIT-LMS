import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { allowRoles } from "../middleware/auth";
import { writeAudit } from "../middleware/audit";
import { calculateWorkingLeaveDays } from "../services/leave-calculation";

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

leaveRouter.post("/policies", hrOnly, async (req, res, next) => {
  try {
    const input = policySchema.parse(req.body);
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

leaveRouter.get("/balances/:employeeId", allStaff, async (req, res, next) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.employeeId }, select: { id: true, employeeNumber: true, firstName: true, lastName: true } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    const rows = await prisma.leaveTransaction.findMany({ where: { employeeId: employee.id }, orderBy: { capturedAt: "asc" } });
    const balances = new Map<string, number>();
    for (const row of rows) {
      const key = row.category;
      const previous = balances.get(key) ?? 0;
      const days = Number(row.days);
      const next = row.type === "DEDUCTION" ? previous - days : previous + days;
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
    return res.json({ items });
  } catch (e) { return next(e); }
});

leaveRouter.post("/transactions", allStaff, async (req, res, next) => {
  try {
    const input = z.object({
      employeeId: z.string().min(1),
      category: z.enum(["ANNUAL","SICK","FAMILY_RESPONSIBILITY","MATERNITY","PATERNITY_PARENTAL","UNPAID","STUDY","OTHER"]),
      firstLeaveDate: z.coerce.date(),
      lastLeaveDate: z.coerce.date(),
      formSubmissionDate: z.coerce.date().optional(),
      reason: z.string().max(2000).optional(),
      referenceNumber: z.string().max(100).optional()
    }).parse(req.body);
    const days = await calculateWorkingLeaveDays(input.employeeId, input.firstLeaveDate, input.lastLeaveDate);
    if (days < 1) return res.status(400).json({ error: "The selected dates contain no scheduled working days" });
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    const policy = await prisma.leavePolicy.findFirst({
      where: {
        category: input.category, isActive: true,
        effectiveFrom: { lte: input.firstLeaveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.lastLeaveDate } }],
        AND: [{ OR: [{ employmentType: null }, { employmentType: employee.employmentType }] }]
      },
      orderBy: { effectiveFrom: "desc" }
    });
    if (!policy) return res.status(409).json({ error: "No active leave policy covers the selected dates and employee type" });

    const transaction = await prisma.$transaction(async tx => {
      const ledger = await tx.leaveTransaction.findMany({ where: { employeeId: input.employeeId, category: input.category }, orderBy: { capturedAt: "asc" } });
      const balance = ledger.reduce((total, row) => total + (row.type === "DEDUCTION" ? -Number(row.days) : Number(row.days)), 0);
      if (balance < days) throw new Error("INSUFFICIENT_LEAVE_BALANCE");
      return tx.leaveTransaction.create({
        data: {
          employeeId: input.employeeId, policyId: policy.id, category: input.category,
          type: "DEDUCTION", firstLeaveDate: input.firstLeaveDate, lastLeaveDate: input.lastLeaveDate,
          formSubmissionDate: input.formSubmissionDate, days, balanceBefore: balance,
          balanceAfter: balance - days, reason: input.reason, referenceNumber: input.referenceNumber,
          capturedById: req.auth!.userId
        },
        include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } }
      });
    }, { isolationLevel: "Serializable" });
    await writeAudit(req, "CREATE", "LeaveTransaction", transaction.id, undefined, transaction);
    return res.status(201).json({ transaction, calculatedWorkingDays: days });
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
    const employee = await prisma.employee.findUnique({ where: { id: req.params.employeeId } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    const transaction = await prisma.$transaction(async tx => {
      const ledger = await tx.leaveTransaction.findMany({ where: { employeeId: employee.id, category: input.category } });
      const balance = ledger.reduce((total, row) => total + (row.type === "DEDUCTION" ? -Number(row.days) : Number(row.days)), 0);
      return tx.leaveTransaction.create({
        data: { employeeId: employee.id, category: input.category, type: "ADJUSTMENT", days: input.days, balanceBefore: balance, balanceAfter: balance + input.days, reason: input.reason, capturedById: req.auth!.userId }
      });
    }, { isolationLevel: "Serializable" });
    await writeAudit(req, "LEAVE_BALANCE_ADJUSTMENT", "LeaveTransaction", transaction.id, undefined, transaction);
    return res.status(201).json({ transaction });
  } catch (e) { return next(e); }
});

leaveRouter.post("/transactions/:id/adjust", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ days: z.number().refine(v => v !== 0), reason: z.string().trim().min(5).max(2000) }).parse(req.body);
    const original = await prisma.leaveTransaction.findUnique({ where: { id: req.params.id } });
    if (!original) return res.status(404).json({ error: "Leave transaction not found" });
    const transaction = await prisma.$transaction(async tx => {
      const ledger = await tx.leaveTransaction.findMany({ where: { employeeId: original.employeeId, category: original.category } });
      const balance = ledger.reduce((total, row) => total + (row.type === "DEDUCTION" ? -Number(row.days) : Number(row.days)), 0);
      const adjustment = await tx.leaveTransaction.create({
        data: { employeeId: original.employeeId, category: original.category, type: "ADJUSTMENT", days: input.days, balanceBefore: balance, balanceAfter: balance + input.days, reason: input.reason, referenceNumber: original.id, capturedById: req.auth!.userId }
      });
      return adjustment;
    }, { isolationLevel: "Serializable" });
    await writeAudit(req, "ADJUST", "LeaveTransaction", transaction.id, undefined, transaction);
    return res.status(201).json({ transaction });
  } catch (e) { return next(e); }
});
