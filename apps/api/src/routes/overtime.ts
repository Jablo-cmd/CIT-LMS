import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { allowRoles } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import { calculateElapsedHours } from "../services/time-calculation.js";
import { toDocumentView } from "../services/document-view.js";


export const overtimeRouter = Router();
const allStaff = allowRoles("COMPANY_OWNER", "HR_MANAGER", "ADMIN_PERSONNEL");

overtimeRouter.get("/", allStaff, async (req, res, next) => {
  try {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const postingSiteId = typeof req.query.postingSiteId === "string" ? req.query.postingSiteId : undefined;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    const items = await prisma.overtimeEntry.findMany({
      where: { ...(employeeId ? { employeeId } : {}), ...(postingSiteId ? { postingSiteId } : {}), ...(from || to ? { workDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } }, postingSite: true, capturedBy: { select: { fullName: true } }, documents: { select: { id:true, title:true, category:true, mimeType:true, createdAt:true } } },
      orderBy: { workDate: "desc" }, take: 500
    });
    return res.json({ items: items.map(item => ({ ...item, documents: item.documents.map(toDocumentView) })) });
  } catch (e) { return next(e); }
});

overtimeRouter.post("/", allStaff, async (req, res, next) => {
  try {
    const input = z.object({
      employeeId: z.string().min(1), postingSiteId: z.string().optional(),
      workDate: z.coerce.date(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      finishTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      confirmedBy: z.string().trim().min(2).max(120), notes: z.string().max(2000).optional(),
      documentIds: z.array(z.string().uuid()).max(10).optional()
    }).parse(req.body);
    const day = input.workDate.getUTCDay();
    if (day !== 0 && day !== 6) return res.status(400).json({ error: "Weekend overtime entries must be dated on a Saturday or Sunday" });
    const totalHours = calculateElapsedHours(input.startTime, input.finishTime);
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    if (input.documentIds?.length) {
      const docs = await prisma.employeeDocument.count({ where: { id: { in: input.documentIds }, employeeId: employee.id } });
      if (docs !== input.documentIds.length) return res.status(400).json({ error: "One or more supporting documents do not belong to this employee" });
    }
    const entry = await prisma.$transaction(async tx => {
      const created = await tx.overtimeEntry.create({
        data: {
          employeeId: employee.id, postingSiteId: input.postingSiteId, workDate: input.workDate,
          startTime: input.startTime, finishTime: input.finishTime, totalHours,
          confirmedBy: input.confirmedBy, notes: input.notes, capturedById: req.auth!.userId
        },
        include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } }, postingSite: true }
      });
      if (input.documentIds?.length) {
        const linked = await tx.employeeDocument.updateMany({
          where: { id: { in: input.documentIds }, employeeId: employee.id, leaveTransactionId: null, overtimeEntryId: null, disciplinaryRecordId: null, recommendationId: null, historyEvent: { is: null } },
          data: { overtimeEntryId: created.id }
        });
        if (linked.count !== input.documentIds.length) throw new Error("A supporting document was linked concurrently; retry with the current document list");
      }
      return tx.overtimeEntry.findUniqueOrThrow({
        where: { id: created.id },
        include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } }, postingSite: true, documents: { select: { id: true, title: true, category: true, mimeType: true, createdAt: true } } }
      });
    });
    await writeAudit(req, "CREATE", "OvertimeEntry", entry.id, undefined, entry);
    return res.status(201).json({ entry: { ...entry, documents: entry.documents.map(toDocumentView) } });
  } catch (e) { return next(e); }
});
