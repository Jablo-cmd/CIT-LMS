import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { allowRoles } from "../middleware/auth";
import { writeAudit } from "../middleware/audit";

export const calendarRouter = Router();
const allStaff = allowRoles("COMPANY_OWNER", "HR_MANAGER", "ADMIN_PERSONNEL");
const hrOnly = allowRoles("COMPANY_OWNER", "HR_MANAGER");

calendarRouter.get("/schedules", allStaff, async (_req, res, next) => {
  try { return res.json({ items: await prisma.workingSchedule.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }) }); }
  catch (e) { return next(e); }
});

calendarRouter.post("/schedules", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(100), workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7), description: z.string().max(1000).optional() }).parse(req.body);
    if (new Set(input.workingDays).size !== input.workingDays.length) return res.status(400).json({ error: "Working days must not contain duplicates" });
    const schedule = await prisma.workingSchedule.create({ data: input });
    await writeAudit(req, "CREATE", "WorkingSchedule", schedule.id, undefined, schedule);
    return res.status(201).json({ schedule });
  } catch (e) { return next(e); }
});

calendarRouter.post("/employees/:employeeId/schedule", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ workingScheduleId: z.string().min(1) }).parse(req.body);
    const schedule = await prisma.workingSchedule.findFirst({ where: { id: input.workingScheduleId, isActive: true } });
    if (!schedule) return res.status(404).json({ error: "Working schedule not found" });
    const before = await prisma.employee.findUnique({ where: { id: req.params.employeeId }, select: { workingScheduleId: true } });
    if (!before) return res.status(404).json({ error: "Employee not found" });
    const employee = await prisma.employee.update({ where: { id: req.params.employeeId }, data: { workingScheduleId: schedule.id }, select: { id: true, employeeNumber: true, workingScheduleId: true } });
    await writeAudit(req, "ASSIGN_WORK_SCHEDULE", "Employee", employee.id, before, employee);
    return res.json({ employee });
  } catch (e) { return next(e); }
});

calendarRouter.get("/holidays", allStaff, async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ error: "Invalid year" });
    const items = await prisma.publicHoliday.findMany({ where: { countryCode: "ZA", date: { gte: new Date(Date.UTC(year,0,1)), lt: new Date(Date.UTC(year+1,0,1)) } }, orderBy: { date: "asc" } });
    return res.json({ year, items });
  } catch (e) { return next(e); }
});

calendarRouter.post("/holidays", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ date: z.coerce.date(), name: z.string().trim().min(2).max(120) }).parse(req.body);
    const date = new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate()));
    const holiday = await prisma.publicHoliday.create({ data: { date, name: input.name, countryCode: "ZA" } });
    await writeAudit(req, "CREATE", "PublicHoliday", holiday.id, undefined, holiday);
    return res.status(201).json({ holiday });
  } catch (e) { return next(e); }
});
