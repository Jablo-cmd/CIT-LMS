import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { allowRoles } from "../middleware/auth";
import { writeAudit } from "../middleware/audit";

export const employeesRouter = Router();
const allStaff = allowRoles("COMPANY_OWNER", "HR_MANAGER", "ADMIN_PERSONNEL");
const hrOnly = allowRoles("COMPANY_OWNER", "HR_MANAGER");

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
  currentPosition: z.string().trim().max(120).optional(),
  currentPostingId: z.string().optional(),
  deployedRole: z.string().trim().max(120).optional(),
  workingScheduleId: z.string().optional()
}).superRefine((v, ctx) => {
  if (v.employmentType === "CONTRACT" && !v.contractStartDate) ctx.addIssue({ code: "custom", path: ["contractStartDate"], message: "Contract start date is required" });
  if (v.contractStartDate && v.contractEndDate && v.contractEndDate < v.contractStartDate) ctx.addIssue({ code: "custom", path: ["contractEndDate"], message: "Contract end date must follow start date" });
});

employeesRouter.get("/", allStaff, async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const postingId = typeof req.query.postingId === "string" ? req.query.postingId : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const where = {
      ...(status ? { employmentStatus: status as "ACTIVE" | "SUSPENDED" | "RESIGNED" | "DISMISSED" | "DECEASED" } : {}),
      ...(postingId ? { currentPostingId: postingId } : {}),
      ...(q ? { OR: [
        { employeeNumber: { contains: q, mode: "insensitive" as const } },
        { firstName: { contains: q, mode: "insensitive" as const } },
        { lastName: { contains: q, mode: "insensitive" as const } },
        { currentPosition: { contains: q, mode: "insensitive" as const } },
        { currentPosting: { name: { contains: q, mode: "insensitive" as const } } }
      ] } : {})
    };
    const isAdmin = req.auth!.role === "ADMIN_PERSONNEL";
    const [items, total] = await Promise.all([
      isAdmin
        ? prisma.employee.findMany({ where, select: { id:true, employeeNumber:true, firstName:true, lastName:true, employmentType:true, employmentStatus:true, originalHireDate:true, currentPosition:true, deployedRole:true, photoPath:true, photoUpdatedAt:true, department:true, currentPosting:true }, orderBy: [{ lastName:"asc" },{ firstName:"asc" }], skip:(page-1)*pageSize, take:pageSize })
        : prisma.employee.findMany({ where, include: { department:true, currentPosting:true }, orderBy: [{ lastName:"asc" },{ firstName:"asc" }], skip:(page-1)*pageSize, take:pageSize }),
      prisma.employee.count({ where })
    ]);
    return res.json({ items, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) { return next(error); }
});

employeesRouter.get("/:id", allStaff, async (req, res, next) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        department: true, currentPosting: true, workingSchedule: true, nextOfKin: true,
        history: { orderBy: { effectiveDate: "desc" }, include: { previousPosting: true, newPosting: true, supportingDocument: true, recordedBy: { select: { fullName:true } } } },
        documents: { where: { disciplinary: { none: {} } }, orderBy: { uploadedAt: "desc" } }
      }
    });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    if (req.auth!.role === "ADMIN_PERSONNEL") {
      const safe = {
        ...employee,
        nationality: null, addressStreet: null, addressSuburb: null, addressCity: null,
        addressProvince: null, addressPostalCode: null, phone: null, email: null,
        nextOfKin: [],
        documents: employee.documents.filter(d => d.category !== "IDENTITY_PERSONAL")
      };
      return res.json({ employee: safe });
    }
    return res.json({ employee });
  } catch (error) { return next(error); }
});

employeesRouter.post("/", allStaff, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    if (req.auth!.role === "ADMIN_PERSONNEL" && (input.currentPosition || input.currentPostingId || input.deployedRole)) {
      return res.status(403).json({ error: "Only HR or the Company Owner may assign an employee's position or posting" });
    }
    if (input.departmentId && !(await prisma.department.findUnique({ where: { id: input.departmentId } }))) return res.status(400).json({ error: "Department not found" });
    if (input.workingScheduleId && !(await prisma.workingSchedule.findUnique({ where: { id: input.workingScheduleId } }))) return res.status(400).json({ error: "Working schedule not found" });
    const employee = await prisma.$transaction(async tx => {
      const created = await tx.employee.create({ data: { ...input, email: input.email || null } });
      if (input.currentPosition || input.currentPostingId || input.deployedRole) {
        await tx.employmentHistory.create({
          data: {
            employeeId: created.id, newPosition: input.currentPosition,
            newPostingId: input.currentPostingId, newDeployedRole: input.deployedRole,
            effectiveDate: input.originalHireDate, reason: "Initial appointment",
            recordedById: req.auth!.userId
          }
        });
      }
      return created;
    });
    await writeAudit(req, "CREATE", "Employee", employee.id, undefined, employee);
    return res.status(201).json({ employee });
  } catch (error) { return next(error); }
});

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  nationality: z.string().trim().max(100).nullable().optional(),
  addressStreet: z.string().max(200).nullable().optional(),
  addressSuburb: z.string().max(120).nullable().optional(),
  addressCity: z.string().max(120).nullable().optional(),
  addressProvince: z.string().max(120).nullable().optional(),
  addressPostalCode: z.string().max(20).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(254).nullable().optional(),
  employmentType: z.enum(["PERMANENT","CONTRACT"]).optional(),
  employmentStatus: z.enum(["ACTIVE","SUSPENDED","RESIGNED","DISMISSED","DECEASED"]).optional(),
  contractStartDate: z.coerce.date().nullable().optional(),
  contractEndDate: z.coerce.date().nullable().optional(),
  departmentId: z.string().nullable().optional(),
}).refine(v => Object.keys(v).length > 0, { message: "At least one field must be supplied" });

employeesRouter.patch("/:id", allStaff, async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const restricted = ["employmentType","employmentStatus","contractStartDate","contractEndDate","departmentId"];
    if (req.auth!.role === "ADMIN_PERSONNEL" && restricted.some(key => key in input)) return res.status(403).json({ error: "This change requires HR Manager or Company Owner permissions" });
    const before = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: "Employee not found" });
    if (input.departmentId && !(await prisma.department.findUnique({ where: { id: input.departmentId } }))) return res.status(400).json({ error: "Department not found" });
    const employee = await prisma.employee.update({ where: { id: req.params.id }, data: input });
    await writeAudit(req, "UPDATE", "Employee", employee.id, before, employee);
    return res.json({ employee });
  } catch (error) { return next(error); }
});

employeesRouter.post("/:id/next-of-kin", allStaff, async (req, res, next) => {
  try {
    const input = z.object({ fullName:z.string().trim().min(2).max(120), relationship:z.string().trim().min(2).max(80), phone:z.string().trim().min(5).max(40), email:z.string().email().optional(), isPrimary:z.boolean().default(false), notes:z.string().max(1000).optional() }).parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { id:req.params.id }, select:{ id:true } });
    if (!employee) return res.status(404).json({ error:"Employee not found" });
    const contact = await prisma.$transaction(async tx => {
      if (input.isPrimary) await tx.nextOfKin.updateMany({ where:{ employeeId:employee.id, isPrimary:true }, data:{ isPrimary:false } });
      return tx.nextOfKin.create({ data:{ ...input, employeeId:employee.id } });
    });
    await writeAudit(req,"CREATE","NextOfKin",contact.id,undefined,contact);
    return res.status(201).json({ contact });
  } catch (error) { return next(error); }
});

employeesRouter.delete("/:id/next-of-kin/:contactId", hrOnly, async (req, res, next) => {
  try {
    const contact = await prisma.nextOfKin.findFirst({ where:{ id:req.params.contactId, employeeId:req.params.id } });
    if (!contact) return res.status(404).json({ error:"Next-of-kin contact not found" });
    await prisma.nextOfKin.delete({ where:{ id:contact.id } });
    await writeAudit(req,"DELETE","NextOfKin",contact.id,contact,undefined);
    return res.status(204).end();
  } catch (error) { return next(error); }
});
