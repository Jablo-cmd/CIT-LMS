import { Router } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, input.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await prisma.auditLog.create({ data: { userId:user.id, action:"LOGIN", entityType:"User", entityId:user.id, ipAddress:req.ip, userAgent:req.get("user-agent")?.slice(0,500) } });
    const token = jwt.sign({ role: user.role, tokenVersion: user.tokenVersion }, config.JWT_ACCESS_SECRET, { subject: user.id, expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] });
    res.cookie("cit_session", token, {
      httpOnly: true, secure: config.COOKIE_SECURE === "true", sameSite: "strict",
      maxAge: 15 * 60 * 1000, path: "/"
    });
    return res.json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
  } catch (error) { return next(error); }
});


authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(14).max(200) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user || !(await argon2.verify(user.passwordHash, input.currentPassword))) return res.status(400).json({ error: "Current password is incorrect" });
    const passwordHash = await argon2.hash(input.newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "CHANGE_PASSWORD", entityType: "User", entityId: user.id, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0,500) } });
    res.clearCookie("cit_session", { httpOnly:true, secure:config.COOKIE_SECURE==="true", sameSite:"strict", path:"/" });
    return res.json({ message: "Password changed. Please sign in again." });
  } catch(e){return next(e);}
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.auditLog.create({ data: { userId:req.auth!.userId, action:"LOGOUT", entityType:"User", entityId:req.auth!.userId, ipAddress:req.ip, userAgent:req.get("user-agent")?.slice(0,500) } });
    await prisma.user.update({ where: { id:req.auth!.userId }, data: { tokenVersion: { increment: 1 } } });
    res.clearCookie("cit_session", { httpOnly: true, secure: config.COOKIE_SECURE === "true", sameSite: "strict", path: "/" });
    return res.status(204).end();
  } catch(e){return next(e);}
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { id: true, email: true, fullName: true, role: true } });
  return res.json({ user });
});
