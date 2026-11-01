import { Router } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db";
import { config } from "../config";
import { requireAuth } from "../middleware/auth";

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
    const token = jwt.sign({ role: user.role }, config.JWT_ACCESS_SECRET, { subject: user.id, expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] });
    res.cookie("cit_session", token, {
      httpOnly: true, secure: config.COOKIE_SECURE === "true", sameSite: "strict",
      maxAge: 15 * 60 * 1000, path: "/"
    });
    return res.json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
  } catch (error) { return next(error); }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("cit_session", { httpOnly: true, secure: config.COOKIE_SECURE === "true", sameSite: "strict", path: "/" });
  return res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { id: true, email: true, fullName: true, role: true } });
  return res.json({ user });
});
