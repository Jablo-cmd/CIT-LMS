import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { clearAuthCookies, setAuthCookies, signInWithPassword, signOutSupabase } from "../services/supabase-auth.js";

export const authRouter = Router();
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });
authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    let session;
    try { session = await signInWithPassword(input.email.trim().toLowerCase(), input.password); }
    catch { return res.status(401).json({ error: "Invalid email or password" }); }
    const profile = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, fullName: true, role: true, isActive: true } });
    if (!profile || !profile.isActive) {
      await signOutSupabase(session.access_token).catch(() => undefined);
      return res.status(403).json({ error: "This account is not authorised for CIT-LMS" });
    }
    await prisma.user.update({ where: { id: profile.id }, data: { lastLoginAt: new Date() } });
    await prisma.auditLog.create({ data: { userId: profile.id, action: "LOGIN", entityType: "User", entityId: profile.id, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 500) } });
    setAuthCookies(res, session);
    return res.json({ user: { id: profile.id, email: profile.email, fullName: profile.fullName, role: profile.role } });
  } catch (error) { return next(error); }
});
authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ newPassword: z.string().min(14).max(200) }).parse(req.body);
    const accessToken = req.cookies?.cit_access_token as string | undefined;
    if (!accessToken) return res.status(401).json({ error: "Authentication required" });
    const response = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, { method: "PUT", headers: { apikey: config.SUPABASE_ANON_KEY!, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ password: input.newPassword }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return res.status(400).json({ error: "Password could not be changed" });
    await prisma.auditLog.create({ data: { userId: req.auth!.userId, action: "CHANGE_PASSWORD", entityType: "User", entityId: req.auth!.userId, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 500) } });
    await signOutSupabase(accessToken).catch(() => undefined); clearAuthCookies(res);
    return res.json({ message: "Password changed. Please sign in again." });
  } catch (error) { return next(error); }
});
authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    const accessToken = req.cookies?.cit_access_token as string | undefined;
    if (accessToken) await signOutSupabase(accessToken).catch(() => undefined);
    await prisma.auditLog.create({ data: { userId: req.auth!.userId, action: "LOGOUT", entityType: "User", entityId: req.auth!.userId, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 500) } });
    clearAuthCookies(res); return res.status(204).end();
  } catch (error) { return next(error); }
});
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try { const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { id: true, email: true, fullName: true, role: true } }); return res.json({ user }); }
  catch (error) { return next(error); }
});
