import { Router } from "express";
import { prisma } from "../db.js";
import { allowRoles } from "../middleware/auth.js";

export const reportsRouter = Router();
const allStaff = allowRoles("COMPANY_OWNER", "HR_MANAGER", "ADMIN_PERSONNEL");
const hrOnly = allowRoles("COMPANY_OWNER", "HR_MANAGER");

reportsRouter.get("/overview", allStaff, async (_req, res, next) => {
  try {
    const [total, active, suspended, permanent, contract, departments, postings] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { employmentStatus: "ACTIVE" } }),
      prisma.employee.count({ where: { employmentStatus: "SUSPENDED" } }),
      prisma.employee.count({ where: { employmentType: "PERMANENT" } }),
      prisma.employee.count({ where: { employmentType: "CONTRACT" } }),
      prisma.employee.groupBy({ by: ["departmentId"], _count: { _all: true } }),
      prisma.employee.groupBy({ by: ["currentPostingId"], _count: { _all: true } })
    ]);
    return res.json({ employees: { total, active, suspended, permanent, contract }, departmentDistribution: departments, postingDistribution: postings });
  } catch (e) { return next(e); }
});


reportsRouter.get("/overtime", allStaff, async (req, res, next) => {
  try {
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) return res.status(400).json({ error: "Invalid overtime report date range" });
    const entries = await prisma.overtimeEntry.findMany({
      where: { ...(from || to ? { workDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      include: { employee: { select: { id:true, employeeNumber:true, firstName:true, lastName:true } }, postingSite: { select: { id:true, name:true, code:true } } },
      orderBy: { workDate:"asc" }
    });
    const byEmployee = new Map<string,{employee:typeof entries[number]["employee"];entries:number;hours:number}>();
    const bySite = new Map<string,{site:string;entries:number;hours:number}>();
    let totalHours = 0;
    for (const entry of entries) {
      const hours = Number(entry.totalHours); totalHours += hours;
      const employeeRow = byEmployee.get(entry.employeeId) ?? { employee:entry.employee, entries:0, hours:0 };
      employeeRow.entries++; employeeRow.hours += hours; byEmployee.set(entry.employeeId,employeeRow);
      const siteKey = entry.postingSite?.id ?? "UNASSIGNED";
      const siteRow = bySite.get(siteKey) ?? { site:entry.postingSite?.name ?? "Unassigned", entries:0, hours:0 };
      siteRow.entries++; siteRow.hours += hours; bySite.set(siteKey,siteRow);
    }
    return res.json({ totalEntries:entries.length, totalHours:Math.round(totalHours*100)/100, byEmployee:[...byEmployee.values()], bySite:[...bySite.values()], entries });
  } catch(e){return next(e);}
});

reportsRouter.get("/leave", hrOnly, async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ error: "Invalid year" });
    const items = await prisma.leaveTransaction.findMany({
      where: { capturedAt: { gte: new Date(Date.UTC(year,0,1)), lt: new Date(Date.UTC(year+1,0,1)) } },
      include: { employee: { select: { employeeNumber:true, firstName:true, lastName:true } } },
      orderBy: { capturedAt:"asc" }
    });
    const totals = new Map<string,{category:string; deductions:number; adjustments:number; count:number}>();
    for (const item of items) {
      const row=totals.get(item.category)??{category:item.category,deductions:0,adjustments:0,count:0};
      if(item.transactionType==="DEDUCTION") row.deductions+=Number(item.days);
      else row.adjustments+=Number(item.days);
      row.count++;
      totals.set(item.category,row);
    }
    return res.json({ year, totals:[...totals.values()], transactions:items.map(item => ({ ...item, type: item.transactionType, reason: item.notes })) });
  } catch(e){return next(e);}
});
