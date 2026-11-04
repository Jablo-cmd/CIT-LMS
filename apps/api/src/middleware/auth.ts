import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { clearAuthCookies, getSupabaseUser, refreshSupabaseSession, setAuthCookies } from "../services/supabase-auth.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    let accessToken = req.cookies?.cit_access_token as string | undefined;
    const refreshToken = req.cookies?.cit_refresh_token as string | undefined;
    if (!accessToken && !refreshToken) return res.status(401).json({ error: "Authentication required" });
    let authUser;
    if (accessToken) {
      try { authUser = await getSupabaseUser(accessToken); }
      catch (error) {
        if (!refreshToken || (error as { status?: number }).status !== 401) throw error;
      }
    }
    if (!authUser && refreshToken) {
      const session = await refreshSupabaseSession(refreshToken);
      setAuthCookies(res, session);
      authUser = session.user;
    }
    if (!authUser?.id) { clearAuthCookies(res); return res.status(401).json({ error: "Invalid or expired session" }); }
    const profile = await prisma.user.findUnique({ where: { id: authUser.id }, select: { id: true, email: true, role: true, isActive: true } });
    if (!profile || !profile.isActive) { clearAuthCookies(res); return res.status(403).json({ error: "Account is not authorised for CIT-LMS" }); }
    req.auth = { userId: profile.id, email: profile.email, role: profile.role };
    return next();
  } catch { return res.status(401).json({ error: "Unable to validate the Supabase session" }); }
}
export function allowRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: "Insufficient permissions" });
    return next();
  };
}
export const isManagement = allowRoles("COMPANY_OWNER", "HR_MANAGER");
export const isOwner = allowRoles("COMPANY_OWNER");
