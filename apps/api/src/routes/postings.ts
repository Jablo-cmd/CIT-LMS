import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { allowRoles } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";

export const postingsRouter = Router();
const allStaff = allowRoles("COMPANY_OWNER", "HR_MANAGER", "ADMIN_PERSONNEL");
const hrOnly = allowRoles("COMPANY_OWNER", "HR_MANAGER");

postingsRouter.get("/sites", allStaff, async (_req, res, next) => {
  try { return res.json({ items: await prisma.postingSite.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }) }); }
  catch (e) { return next(e); }
});

postingsRouter.post("/sites", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9-]+$/), name: z.string().trim().min(2).max(120), address: z.string().max(300).optional(), city: z.string().max(100).optional(), province: z.string().max(100).optional(), isHeadOffice: z.boolean().default(false) }).parse(req.body);
    const site = await prisma.postingSite.create({ data: input });
    await writeAudit(req, "CREATE", "PostingSite", site.id, undefined, site);
    return res.status(201).json({ site });
  } catch (e) { return next(e); }
});

postingsRouter.get("/departments", allStaff, async (_req, res, next) => {
  try { return res.json({ items: await prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }) }); }
  catch (e) { return next(e); }
});

postingsRouter.post("/departments", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(100) }).parse(req.body);
    const department = await prisma.department.create({ data: input });
    await writeAudit(req, "CREATE", "Department", department.id, undefined, department);
    return res.status(201).json({ department });
  } catch (e) { return next(e); }
});

postingsRouter.get("/history/:employeeId", allStaff, async (req, res, next) => {
  try {
    const items = await prisma.employmentHistory.findMany({
      where: { employeeId: String(req.params.employeeId) },
      include: { previousPosting: true, newPosting: true, supportingDocument: { select: { id:true, title:true, category:true, originalName:true, uploadedAt:true } }, recordedBy: { select: { fullName: true } } },
      orderBy: [{ effectiveDate: "desc" }, { recordedAt: "desc" }]
    });
    return res.json({ items });
  } catch (e) { return next(e); }
});

postingsRouter.post("/history/:employeeId", hrOnly, async (req, res, next) => {
  try {
    const input = z.object({
      newPosition: z.string().trim().max(120).optional(),
      newDeployedRole: z.string().trim().max(120).optional(),
      newPostingId: z.string().optional(),
      effectiveDate: z.coerce.date(),
      reason: z.string().trim().min(5).max(1000),
      managerName: z.string().trim().max(120).optional(),
      notes: z.string().max(3000).optional(),
      supportingDocumentId: z.string().min(1)
    }).refine(v => !!v.newPosition || !!v.newDeployedRole || !!v.newPostingId, { message: "A position or posting change is required" }).parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { id: String(req.params.employeeId) } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    if (input.effectiveDate < employee.originalHireDate) return res.status(400).json({ error: "An employment history event cannot predate the original CIT hire date" });
    const latestEvent = await prisma.employmentHistory.findFirst({ where: { employeeId: employee.id }, orderBy: [{ effectiveDate:"desc" },{ recordedAt:"desc" }], select: { effectiveDate:true } });
    if (latestEvent && input.effectiveDate < latestEvent.effectiveDate) return res.status(409).json({ error: "Assignment events must be recorded in chronological order. Correct the existing history with HR before adding an earlier event." });
    const document = await prisma.employeeDocument.findFirst({ where: { id: input.supportingDocumentId, employeeId: employee.id } });
    if (!document) return res.status(400).json({ error: "A supporting document belonging to this employee is required" });
    if (input.newPostingId) {
      const site = await prisma.postingSite.findFirst({ where: { id: input.newPostingId, isActive: true } });
      if (!site) return res.status(400).json({ error: "The selected posting site is unavailable" });
    }
    const history = await prisma.$transaction(async tx => {
      const created = await tx.employmentHistory.create({
        data: {
          employeeId: employee.id, previousPosition: employee.currentPosition,
          newPosition: input.newPosition ?? employee.currentPosition,
          previousDeployedRole: employee.deployedRole,
          newDeployedRole: input.newDeployedRole ?? employee.deployedRole,
          previousPostingId: employee.currentPostingId,
          newPostingId: input.newPostingId ?? employee.currentPostingId,
          effectiveDate: input.effectiveDate, reason: input.reason,
          managerName: input.managerName, notes: input.notes,
          supportingDocumentId: document.id, recordedById: req.auth!.userId
        },
        include: { previousPosting: true, newPosting: true, supportingDocument: { select: { id:true, title:true, category:true, originalName:true, uploadedAt:true } } }
      });
      await tx.employee.update({ where: { id: employee.id }, data: {
        ...(input.newPosition ? { currentPosition: input.newPosition } : {}),
        ...(input.newDeployedRole ? { deployedRole: input.newDeployedRole } : {}),
        ...(input.newPostingId ? { currentPostingId: input.newPostingId } : {})
      } });
      return created;
    });
    await writeAudit(req, "CREATE", "EmploymentHistory", history.id, undefined, history);
    return res.status(201).json({ history });
  } catch (e) { return next(e); }
});
