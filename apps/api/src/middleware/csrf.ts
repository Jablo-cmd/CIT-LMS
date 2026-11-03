import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const trustedOrigin = new URL(config.WEB_ORIGIN).origin;

export function protectCookieMutations(req: Request, res: Response, next: NextFunction) {
  if (safeMethods.has(req.method)) return next();
  if (req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ error: "Cross-site request rejected" });

  const origin = req.get("origin");
  const referer = req.get("referer");
  if (!origin && !referer) return res.status(403).json({ error: "Request origin is required" });

  try {
    const requestOrigin = origin ? new URL(origin).origin : new URL(referer!).origin;
    if (requestOrigin === trustedOrigin) return next();
  } catch {
    return res.status(403).json({ error: "Request origin could not be verified" });
  }
  return res.status(403).json({ error: "Request origin is not allowed" });
}