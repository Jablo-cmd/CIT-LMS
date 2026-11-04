import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { isOwner } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import { createSupabaseUser, deleteSupabaseUser, updateSupabaseUserPassword } from "../services/supabase-auth.js";

export const usersRouter = Router();
usersRouter.use(isOwner);

usersRouter.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true, fullName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true }, orderBy: { fullName: "asc" } });
    return res.json({ items: users });
  } catch (e) { return next(e); }
});

usersRouter.post("/", async (req, res, next) => {
  let createdAuthUserId: string | undefined;
  try {
    const input = z.object({
      email: z.string().email().max(254),
      fullName: z.string().trim().min(2).max(120),
      password: z.string().min(14).max(200),
      role: z.enum(["COMPANY_OWNER", "HR_MANAGER", "ADMIN_PERSONNEL"])
    }).parse(req.body);
    const email = input.email.trim().toLowerCase();
    const authUser = await createSupabaseUser(email, input.password, input.fullName);
    createdAuthUserId = authUser.id;
    const user = await prisma.user.create({
      data: { id: authUser.id, email, fullName: input.fullName, role: input.role },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true }
    });
    await writeAudit(req, "CREATE", "User", user.id, undefined, user);
    return res.status(201).json({ user });
  } catch (e) {
    if (createdAuthUserId) await deleteSupabaseUser(createdAuthUserId).catch(() => undefined);
    return next(e);
  }
});

usersRouter.post("/:id/reset-password", async (req, res, next) => {
  try {
    const input = z.object({ newPassword: z.string().min(14).max(200) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: String(req.params.id) }, select: { id: true, email: true } });
    if (!user) return res.status(404).json({ error: "User not found" });
    await updateSupabaseUserPassword(user.id, input.newPassword);
    await writeAudit(req, "RESET_PASSWORD", "User", user.id, undefined, { id: user.id, email: user.email });
    return res.json({ message: "Password reset in Supabase Auth." });
  } catch (e) { return next(e); }
});

usersRouter.patch("/:id", async (req, res, next) => {
  try {
    const input = z.object({
      isActive: z.boolean().optional(),
      role: z.enum(["COMPANY_OWNER", "HR_MANAGER", "ADMIN_PERSONNEL"]).optional(),
      fullName: z.string().trim().min(2).max(120).optional()
    }).refine(v => Object.keys(v).length > 0).parse(req.body);
    const id = String(req.params.id);
    if (id === req.auth!.userId && input.isActive === false) return res.status(400).json({ error: "You cannot deactivate your own account" });
    const before = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, fullName: true, role: true, isActive: true } });
    if (!before) return res.status(404).json({ error: "User not found" });
    if (before.role === "COMPANY_OWNER" && (input.role && input.role !== "COMPANY_OWNER" || input.isActive === false)) {
      const activeOwners = await prisma.user.count({ where: { role: "COMPANY_OWNER", isActive: true } });
      if (activeOwners <= 1) return res.status(409).json({ error: "At least one active Company Owner account must remain" });
    }
    const user = await prisma.user.update({ where: { id }, data: input, select: { id: true, email: true, fullName: true, role: true, isActive: true } });
    await writeAudit(req, "UPDATE", "User", user.id, before, user);
    return res.json({ user });
  } catch (e) { return next(e); }
});
