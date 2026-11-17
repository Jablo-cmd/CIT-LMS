import { Router } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();
const cookieBase = { httpOnly: true, secure: config.COOKIE_SECURE === "true", sameSite: config.COOKIE_SAMESITE, path: "/" } as const;
// Hash verified against when the account does not exist, so response time does not reveal which emails are registered.
// Account lockout lives in the database rather than process memory, so it holds across serverless instances.
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const decoyHash = await argon2.hash("decoy-password-for-timing-equalisation");
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    const passwordOk = await argon2.verify(user?.passwordHash ?? decoyHash, input.password);
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(429).json({ error: "Too many failed sign-in attempts. Try again later or ask a Company Owner to reset your password." });
    }
    if (!user || !user.isActive || !passwordOk) {
      if (user) {
        const { failedLoginCount } = await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } }, select: { failedLoginCount: true } });
        if (failedLoginCount >= MAX_FAILED_LOGINS) {
          await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) } });
          await prisma.auditLog.create({ data: { userId: user.id, action: "LOGIN_LOCKOUT", entityType: "User", entityId: user.id, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0,500) } });
        }
      }
      return res.status(401).json({ error: "Invalid email or password" });
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
    await prisma.auditLog.create({ data: { userId:user.id, action:"LOGIN", entityType:"User", entityId:user.id, ipAddress:req.ip, userAgent:req.get("user-agent")?.slice(0,500) } });
    const token = jwt.sign({ role: user.role, tokenVersion: user.tokenVersion }, config.JWT_ACCESS_SECRET, { subject: user.id, expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] });
    // Keep the cookie lifetime in step with the token's own expiry so the two cannot diverge.
    const { exp } = jwt.decode(token) as jwt.JwtPayload;
    res.cookie("cit_session", token, { ...cookieBase, maxAge: Math.max(0, (exp ?? 0) * 1000 - Date.now()) });
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
    res.clearCookie("cit_session", cookieBase);
    return res.json({ message: "Password changed. Please sign in again." });
  } catch(e){return next(e);}
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.auditLog.create({ data: { userId:req.auth!.userId, action:"LOGOUT", entityType:"User", entityId:req.auth!.userId, ipAddress:req.ip, userAgent:req.get("user-agent")?.slice(0,500) } });
    await prisma.user.update({ where: { id:req.auth!.userId }, data: { tokenVersion: { increment: 1 } } });
    res.clearCookie("cit_session", cookieBase);
    return res.status(204).end();
  } catch(e){return next(e);}
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { id: true, email: true, fullName: true, role: true } });
  return res.json({ user });
});
