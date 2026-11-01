import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { allowRoles } from "../middleware/auth";
import { writeAudit } from "../middleware/audit";

export const recommendationsRouter = Router();
recommendationsRouter.use(allowRoles("COMPANY_OWNER", "HR_MANAGER"));

recommendationsRouter.get("/", async (req, res, next) => {
  try {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const items = await prisma.recommendation.findMany({
      where: employeeId ? { employeeId } : {},
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } }, capturedBy: { select: { fullName: true } }, documents: true },
      orderBy: { date: "desc" }, take: 300
    });
    return res.json({ items });
  } catch (e) { return next(e); }
});

recommendationsRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({
      employeeId: z.string().min(1), date: z.coerce.date(),
      type: z.enum(["COMMENDATION","PERFORMANCE","PROMOTION","OTHER"]),
      description: z.string().trim().min(5).max(3000), submittedBy: z.string().trim().min(2).max(120),
      comments: z.string().max(3000).optional(), documentIds: z.array(z.string()).max(10).optional()
    }).parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    if (input.documentIds?.length) {
      const count = await prisma.employeeDocument.count({ where: { id: { in: input.documentIds }, employeeId: employee.id } });
      if (count !== input.documentIds.length) return res.status(400).json({ error: "One or more documents do not belong to this employee" });
    }
    const record = await prisma.recommendation.create({
      data: { ...input, capturedById: req.auth!.userId, documents: input.documentIds?.length ? { connect: input.documentIds.map(id => ({ id })) } : undefined },
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } }, documents: true }
    });
    await writeAudit(req, "CREATE", "Recommendation", record.id, undefined, record);
    return res.status(201).json({ record });
  } catch (e) { return next(e); }
});
