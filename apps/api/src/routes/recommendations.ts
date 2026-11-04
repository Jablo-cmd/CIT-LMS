import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { allowRoles } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import { toDocumentView } from "../services/document-view.js";

export const recommendationsRouter = Router();
recommendationsRouter.use(allowRoles("COMPANY_OWNER", "HR_MANAGER"));

recommendationsRouter.get("/", async (req, res, next) => {
  try {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const items = await prisma.recommendation.findMany({
      where: employeeId ? { employeeId } : {},
      include: {
        employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
        capturedBy: { select: { fullName: true } },
        documents: { select: { id: true, title: true, category: true, mimeType: true, createdAt: true } }
      },
      orderBy: { date: "desc" },
      take: 300
    });
    return res.json({ items: items.map(item => ({ ...item, documents: item.documents.map(toDocumentView) })) });
  } catch (e) { return next(e); }
});

recommendationsRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({
      employeeId: z.string().uuid(),
      date: z.coerce.date(),
      type: z.enum(["COMMENDATION","PERFORMANCE","PROMOTION","OTHER"]),
      description: z.string().trim().min(5).max(3000),
      submittedBy: z.string().trim().min(2).max(120),
      comments: z.string().max(3000).optional(),
      documentIds: z.array(z.string().uuid()).max(10).optional()
    }).parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    if (input.documentIds?.length) {
      const count = await prisma.employeeDocument.count({ where: { id: { in: input.documentIds }, employeeId: employee.id, leaveTransactionId: null, overtimeEntryId: null, disciplinaryRecordId: null, recommendationId: null, historyEvent: { is: null } } });
      if (count !== input.documentIds.length) return res.status(400).json({ error: "Every supporting document must belong to this employee and be unassigned" });
    }
    const record = await prisma.$transaction(async tx => {
      const created = await tx.recommendation.create({
        data: { employeeId: employee.id, date: input.date, type: input.type, description: input.description, submittedBy: input.submittedBy, comments: input.comments, capturedById: req.auth!.userId },
        include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } }
      });
      if (input.documentIds?.length) {
        const linked = await tx.employeeDocument.updateMany({
          where: { id: { in: input.documentIds }, employeeId: employee.id, recommendationId: null },
          data: { recommendationId: created.id }
        });
        if (linked.count !== input.documentIds.length) throw new Error("A supporting document was linked concurrently; retry with the current document list");
      }
      return tx.recommendation.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
          documents: { select: { id: true, title: true, category: true, mimeType: true, createdAt: true } }
        }
      });
    });
    const recordView = { ...record, documents: record.documents.map(toDocumentView) };
    await writeAudit(req, "CREATE", "Recommendation", record.id, undefined, recordView);
    return res.status(201).json({ record: recordView });
  } catch (e) { return next(e); }
});
