import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { allowRoles } from "../middleware/auth";
import { writeAudit } from "../middleware/audit";

export const employeesRouter = Router();
const roles = allowRoles("COMPANY_OWNER", "HR_MANAGER", "ADMIN_PERSONNEL");
const createSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  nationality: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().email().max(254).optional().or(z.literal("")),
  employmentType: z.enum(["PERMANENT", "CONTRACT"]),
  employmentStatus: z.enum(["ACTIVE", "SUSPENDED", "RESIGNED", "DISMISSED", "DECEASED"]).default("ACTIVE"),
  originalHireDate: z.coerce.date(),
  contractStartDate: z.coerce.date().optional(),
  contractEndDate: z.coerce.date().optional(),
  departmentId: z.string().optional(),
  currentPosition: z.string().trim().max(120).optional()
}).superRefine((v, ctx) => {
  if (v.employmentType === "CONTRACT" && !v.contractStartDate) ctx.addIssue({ code: "custom", path: ["contractStartDate"], message: "Contract start date is required" });
  if (v.contractStartDate && v.contractEndDate && v.contractEndDate < v.contractStartDate) ctx.addIssue({ code: "custom", path: ["contractEndDate"], message: "Contract end date must follow start date" });
});

employeesRouter.get("/", roles, async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const where = {
      ...(status ? { employmentStatus: status as "ACTIVE" | "SUSPENDED" | "RESIGNED" | "DISMISSED" | "DECEASED" } : {}),
      ...(q ? { OR: [
        { employeeNumber: { contains: q, mode: "insensitive" as const } },
        { firstName: { contains: q, mode: "insensitive" as const } },
        { lastName: { contains: q, mode: "insensitive" as const } },
        { currentPosition: { contains: q, mode: "insensitive" as const } },
        { currentPosting: { name: { contains: q, mode: "insensitive" as const } } }
      ] } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.employee.findMany({ where, include: { department: true, currentPosting: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.employee.count({ where })
    ]);
    return res.json({ items, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) { return next(error); }
});

employeesRouter.get("/:id", roles, async (req, res, next) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { department: true, currentPosting: true, nextOfKin: true, history: { orderBy: { effectiveDate: "desc" }, include: { previousPosting: true, newPosting: true, supportingDocument: true } }, documents: { orderBy: { uploadedAt: "desc" } } }
    });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    return res.json({ employee });
  } catch (error) { return next(error); }
});

employeesRouter.post("/", roles, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const employee = await prisma.employee.create({ data: { ...input, email: input.email || null } });
    await writeAudit(req, "CREATE", "Employee", employee.id, undefined, employee);
    return res.status(201).json({ employee });
  } catch (error) { return next(error); }
});
