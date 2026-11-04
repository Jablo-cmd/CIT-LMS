import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { allowRoles } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import { toDocumentView } from "../services/document-view.js";

export const disciplinaryRouter = Router();
disciplinaryRouter.use(allowRoles("COMPANY_OWNER", "HR_MANAGER"));

disciplinaryRouter.get("/", async (req, res, next) => {
  try {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const items = await prisma.disciplinaryRecord.findMany({
      where: employeeId ? { employeeId } : {},
      include: {
        employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
        capturedBy: { select: { fullName: true } },
        documents: { select: { id: true, title: true, category: true, mimeType: true, createdAt: true } }
      },
      orderBy: { hearingDate: "desc" },
      take: 300
    });
    return res.json({ items: items.map(item => ({ ...item, documents: item.documents.map(toDocumentView) })) });
  } catch (e) { return next(e); }
});

disciplinaryRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({
      employeeId: z.string().uuid(),
      hearingDate: z.coerce.date(),
      matter: z.string().trim().min(5).max(3000),
      finding: z.string().max(3000).optional(),
      outcome: z.enum(["PENDING","NO_ACTION","VERBAL_WARNING","WRITTEN_WARNING","FINAL_WARNING","SUSPENSION","DISMISSAL","OTHER"]).default("PENDING"),
      sanction: z.string().max(2000).optional(),
      notes: z.string().max(3000).optional(),
      documentIds: z.array(z.string().uuid()).max(10).optional()
    }).parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    if (input.documentIds?.length) {
      const count = await prisma.employeeDocument.count({ where: { id: { in: input.documentIds }, employeeId: employee.id, leaveTransactionId: null, overtimeEntryId: null, disciplinaryRecordId: null, recommendationId: null, historyEvent: { is: null } } });
      if (count !== input.documentIds.length) return res.status(400).json({ error: "Every supporting document must belong to this employee and be unassigned" });
    }
    const record = await prisma.$transaction(async tx => {
      const created = await tx.disciplinaryRecord.create({
        data: { employeeId: employee.id, hearingDate: input.hearingDate, matter: input.matter, finding: input.finding, outcome: input.outcome, sanction: input.sanction, notes: input.notes, capturedById: req.auth!.userId },
        include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } }
      });
      if (input.documentIds?.length) {
        const linked = await tx.employeeDocument.updateMany({
          where: { id: { in: input.documentIds }, employeeId: employee.id, disciplinaryRecordId: null },
          data: { disciplinaryRecordId: created.id }
        });
        if (linked.count !== input.documentIds.length) throw new Error("A supporting document was linked concurrently; retry with the current document list");
      }
      return tx.disciplinaryRecord.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
          documents: { select: { id: true, title: true, category: true, mimeType: true, createdAt: true } }
        }
      });
    });
    const recordView = { ...record, documents: record.documents.map(toDocumentView) };
    await writeAudit(req, "CREATE", "DisciplinaryRecord", record.id, undefined, recordView);
    return res.status(201).json({ record: recordView });
  } catch (e) { return next(e); }
});
