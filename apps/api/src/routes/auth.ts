import { Router } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { clearSession, issueSession } from "../services/session.js";
import { isLocked, recordFailedAttempt } from "../services/login-throttle.js";
import { signMfaToken } from "../services/mfa.js";
import { mfaRouter } from "./mfa.js";

export const authRouter = Router();
authRouter.use("/mfa", mfaRouter);
// Hash verified against when the account does not exist, so response time does not reveal which emails are registered.
const decoyHash = await argon2.hash("decoy-password-for-timing-equalisation");
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    const passwordOk = await argon2.verify(user?.passwordHash ?? decoyHash, input.password);
    if (user && isLocked(user)) {
      return res.status(429).json({ error: "Too many failed sign-in attempts. Try again later or ask a Company Owner to reset your password." });
    }
    if (!user || !user.isActive || !passwordOk) {
      if (user) await recordFailedAttempt(req, user.id);
      return res.status(401).json({ error: "Invalid email or password" });
    }
    // Password is correct. With MFA enabled this is only the first factor: hand back a short-lived challenge token
    // (not a session) and finish signing in at /auth/mfa/verify. Failure counters are kept until that completes.
    if (user.mfaEnabled) return res.json({ mfaRequired: true, mfaToken: signMfaToken(user.id, user.tokenVersion) });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
    await prisma.auditLog.create({ data: { userId:user.id, action:"LOGIN", entityType:"User", entityId:user.id, ipAddress:req.ip, userAgent:req.get("user-agent")?.slice(0,500) } });
    issueSession(res, user, false);
    return res.json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }, mfaEnrollmentRequired: config.mfaRequired });
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
    clearSession(res);
    return res.json({ message: "Password changed. Please sign in again." });
  } catch(e){return next(e);}
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.auditLog.create({ data: { userId:req.auth!.userId, action:"LOGOUT", entityType:"User", entityId:req.auth!.userId, ipAddress:req.ip, userAgent:req.get("user-agent")?.slice(0,500) } });
    await prisma.user.update({ where: { id:req.auth!.userId }, data: { tokenVersion: { increment: 1 } } });
    clearSession(res);
    return res.status(204).end();
  } catch(e){return next(e);}
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { id: true, email: true, fullName: true, role: true } });
  return res.json({ user, mfaEnabled: req.auth!.mfaEnabled, mfaEnrollmentRequired: req.auth!.mfaEnrollmentRequired });
});
