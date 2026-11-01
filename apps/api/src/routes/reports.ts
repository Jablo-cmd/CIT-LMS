import { Router } from "express";
import { prisma } from "../db";
import { allowRoles } from "../middleware/auth";

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
      if(item.type==="DEDUCTION") row.deductions+=Number(item.days);
      else row.adjustments+=Number(item.days);
      row.count++;
      totals.set(item.category,row);
    }
    return res.json({ year, totals:[...totals.values()], transactions:items });
  } catch(e){return next(e);}
});
