import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { allowRoles } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";

export const disciplinaryRouter = Router();
disciplinaryRouter.use(allowRoles("COMPANY_OWNER", "HR_MANAGER"));

disciplinaryRouter.get("/", async (req, res, next) => {
  try {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const items = await prisma.disciplinaryRecord.findMany({
      where: employeeId ? { employeeId } : {},
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } }, capturedBy: { select: { fullName: true } }, documents: { select: { id:true, title:true, category:true, originalName:true, uploadedAt:true } } },
      orderBy: { hearingDate: "desc" }, take: 300
    });
    return res.json({ items });
  } catch (e) { return next(e); }
});

disciplinaryRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({
      employeeId: z.string().min(1), hearingDate: z.coerce.date(),
      matter: z.string().trim().min(5).max(3000), finding: z.string().max(3000).optional(),
      outcome: z.enum(["PENDING","NO_ACTION","VERBAL_WARNING","WRITTEN_WARNING","FINAL_WARNING","SUSPENSION","DISMISSAL","OTHER"]).default("PENDING"),
      sanction: z.string().max(2000).optional(), notes: z.string().max(3000).optional(),
      documentIds: z.array(z.string()).max(10).optional()
    }).parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    if (input.documentIds?.length) {
      const count = await prisma.employeeDocument.count({ where: { id: { in: input.documentIds }, employeeId: employee.id } });
      if (count !== input.documentIds.length) return res.status(400).json({ error: "One or more documents do not belong to this employee" });
    }
    const record = await prisma.disciplinaryRecord.create({
      data: { ...input, capturedById: req.auth!.userId, documents: input.documentIds?.length ? { connect: input.documentIds.map(id => ({ id })) } : undefined },
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } }, documents: { select: { id:true, title:true, category:true, originalName:true, uploadedAt:true } } }
    });
    await writeAudit(req, "CREATE", "DisciplinaryRecord", record.id, undefined, record);
    return res.status(201).json({ record });
  } catch (e) { return next(e); }
});
