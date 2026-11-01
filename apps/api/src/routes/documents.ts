import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { allowRoles } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";

export const documentsRouter = Router();
const allStaff = allowRoles("COMPANY_OWNER", "HR_MANAGER", "ADMIN_PERSONNEL");
const hrOnly = allowRoles("COMPANY_OWNER", "HR_MANAGER");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 } });

const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"]);
function validSignature(buffer: Buffer, extension: string) {
  if (extension === ".pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".png") return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (extension === ".jpg" || extension === ".jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === ".doc") return buffer.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
  if (extension === ".docx") return buffer.subarray(0, 4).equals(Buffer.from([0x50,0x4b,0x03,0x04]));
  return false;
}
function isSensitiveCategory(category: string) { return category === "IDENTITY_PERSONAL"; }


documentsRouter.get("/", allStaff, async (req, res, next) => {
  try {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const isAdmin = req.auth!.role === "ADMIN_PERSONNEL";
    const items = await prisma.employeeDocument.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(category ? { category: category as never } : {}),
        ...(isAdmin ? { category: { not: "IDENTITY_PERSONAL" }, disciplinary: { none: {} } } : {})
      },
      select: { id:true, employeeId:true, title:true, category:true, originalName:true, mimeType:true, sizeBytes:true, description:true, uploadedAt:true, employee:{select:{employeeNumber:true,firstName:true,lastName:true}}, uploadedBy:{select:{fullName:true}} },
      orderBy: { uploadedAt:"desc" }, take:500
    });
    return res.json({items});
  } catch(e){return next(e);}
});

documentsRouter.get("/employee/:employeeId", allStaff, async (req, res, next) => {
  try {
    const isHr = req.auth!.role !== "ADMIN_PERSONNEL";
    const items = await prisma.employeeDocument.findMany({
      where: {
        employeeId: String(req.params.employeeId),
        ...(isHr ? {} : { category: { not: "IDENTITY_PERSONAL" }, disciplinary: { none: {} } })
      },
      select: { id: true, title: true, category: true, originalName: true, mimeType: true, sizeBytes: true, description: true, uploadedAt: true, uploadedBy: { select: { fullName: true } } },
      orderBy: { uploadedAt: "desc" }
    });
    return res.json({ items });
  } catch (e) { return next(e); }
});

documentsRouter.post("/:employeeId", allStaff, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "A document file is required" });
    const input = z.object({
      title: z.string().trim().min(2).max(150),
      category: z.enum(["ACADEMIC_QUALIFICATION","PROFESSIONAL_CERTIFICATE","TRAINING_CERTIFICATE","IDENTITY_PERSONAL","EMPLOYMENT","OTHER"]),
      description: z.string().max(2000).optional()
    }).parse(req.body);
    if (req.auth!.role === "ADMIN_PERSONNEL" && isSensitiveCategory(input.category)) return res.status(403).json({ error: "Only HR or the Company Owner may upload identity and personal documents" });
    const employee = await prisma.employee.findUnique({ where: { id: String(req.params.employeeId) }, select: { id: true } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    const extension = path.extname(req.file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension) || !validSignature(req.file.buffer, extension)) return res.status(415).json({ error: "File content does not match an allowed PDF, Word, JPG or PNG format" });
    const safeOriginalName = path.basename(req.file.originalname).replace(/[\u0000-\u001f]/g, "").slice(0, 180);
    const relativePath = path.join(employee.id, `${randomUUID()}${extension}`);
    const root = path.resolve(config.STORAGE_ROOT);
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(root + path.sep)) return res.status(400).json({ error: "Invalid storage path" });
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, req.file.buffer, { flag: "wx", mode: 0o600 });
    try {
      const document = await prisma.employeeDocument.create({
        data: {
          employeeId: employee.id, title: input.title, category: input.category,
          originalName: safeOriginalName, storagePath: relativePath,
          mimeType: req.file.mimetype, sizeBytes: req.file.size,
          description: input.description, uploadedById: req.auth!.userId
        },
        select: { id: true, title: true, category: true, originalName: true, mimeType: true, sizeBytes: true, uploadedAt: true }
      });
      await writeAudit(req, "UPLOAD", "EmployeeDocument", document.id, undefined, document);
      return res.status(201).json({ document });
    } catch (error) {
      const { unlink } = await import("node:fs/promises");
      await unlink(target).catch(() => undefined);
      throw error;
    }
  } catch (e) { return next(e); }
});


documentsRouter.get("/photos/:employeeId", allStaff, async (req, res, next) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: String(req.params.employeeId) }, select: { photoPath: true } });
    if (!employee?.photoPath) return res.status(404).json({ error: "Employee photograph not found" });
    const root = path.resolve(config.STORAGE_ROOT);
    const target = path.resolve(root, employee.photoPath);
    if (!target.startsWith(root + path.sep)) return res.status(400).json({ error: "Invalid photograph path" });
    return res.sendFile(target, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }, error => {
      if (error && !res.headersSent) next(error);
    });
  } catch (e) { return next(e); }
});

documentsRouter.get("/:id/download", allStaff, async (req, res, next) => {
  try {
    const document = await prisma.employeeDocument.findUnique({ where: { id: String(req.params.id) }, include: { disciplinary: { select: { id: true } } } });
    if (!document) return res.status(404).json({ error: "Document not found" });
    if (req.auth!.role === "ADMIN_PERSONNEL" && (isSensitiveCategory(document.category) || document.disciplinary.length > 0)) return res.status(403).json({ error: "You do not have permission to access this document" });
    const root = path.resolve(config.STORAGE_ROOT);
    const target = path.resolve(root, document.storagePath);
    if (!target.startsWith(root + path.sep)) return res.status(400).json({ error: "Invalid document path" });
    return res.download(target, document.originalName);
  } catch (e) { return next(e); }
});

documentsRouter.post("/photos/:employeeId", hrOnly, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "A JPG or PNG photo is required" });
    const extension = path.extname(req.file.originalname).toLowerCase();
    if (![".jpg", ".jpeg", ".png"].includes(extension) || !validSignature(req.file.buffer, extension)) return res.status(415).json({ error: "Only valid JPG and PNG photographs are accepted" });
    const employee = await prisma.employee.findUnique({ where: { id: String(req.params.employeeId) } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    const relativePath = path.join(employee.id, `photo-${randomUUID()}${extension}`);
    const root = path.resolve(config.STORAGE_ROOT);
    const target = path.resolve(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, req.file.buffer, { flag: "wx", mode: 0o600 });
    const updated = await prisma.employee.update({ where: { id: employee.id }, data: { photoPath: relativePath, photoUpdatedAt: new Date() }, select: { id: true, photoUpdatedAt: true } });
    await writeAudit(req, "UPDATE_PHOTO", "Employee", employee.id, { photoPath: employee.photoPath }, updated);
    return res.json({ employee: updated });
  } catch (e) { return next(e); }
});
