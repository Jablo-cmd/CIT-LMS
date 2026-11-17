import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { usersRouter } from "./routes/users.js";
import { leaveRouter } from "./routes/leave.js";
import { postingsRouter } from "./routes/postings.js";
import { overtimeRouter } from "./routes/overtime.js";
import { disciplinaryRouter } from "./routes/disciplinary.js";
import { recommendationsRouter } from "./routes/recommendations.js";
import { documentsRouter } from "./routes/documents.js";
import { calendarRouter } from "./routes/calendar.js";
import { reportsRouter } from "./routes/reports.js";
import { auditRouter } from "./routes/audit.js";
import { requireAuth, requireMfaEnrolled } from "./middleware/auth.js";
import { protectCookieMutations } from "./middleware/csrf.js";
import { verifyPrivateBucket } from "./services/document-storage.js";
import { HttpError } from "./errors.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.NODE_ENV === "production" ? 1 : false);
// Vercel's TypeScript step types helmet's default export as the module namespace (TS2349 "not callable"),
// while tsc here types it as the function. At runtime Node's ESM interop yields the function either way.
// The import must stay static: Vercel bundles only packages it can see imported, so loading helmet through
// createRequire() left it out of the deployment ("Cannot find module 'helmet'" at start-up).
// @ts-ignore
app.use(helmet());
app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/api", protectCookieMutations);
app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));
app.use("/api/auth/change-password", rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false }));
app.use("/api/auth/mfa/verify", rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false }));
app.use("/api/users/:id/reset-password", rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false }));
app.get("/api/health", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; return res.json({ status: "ok", database: "connected", service: "cit-lms-api" }); }
  catch { return res.status(503).json({ status: "unavailable", database: "unavailable", service: "cit-lms-api" }); }
});
// On Vercel the platform loads this module directly and server.ts (which verifies the document bucket at
// start-up) never runs. Verify once per instance on first use instead, and fail closed if it is not private.
let bucketVerification: Promise<void> | undefined;
app.use("/api", async (_req, _res, next) => {
  try {
    bucketVerification ??= verifyPrivateBucket();
    await bucketVerification;
    return next();
  } catch (error) {
    bucketVerification = undefined;
    return next(error);
  }
});
app.use("/api/auth", authRouter);
app.use("/api", requireAuth, requireMfaEnrolled);
app.use("/api/users", usersRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/leave", leaveRouter);
app.use("/api/postings", postingsRouter);
app.use("/api/overtime", overtimeRouter);
app.use("/api/disciplinary", disciplinaryRouter);
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/audit", auditRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: "Validation failed", details: err.issues });
  if (typeof err === "object" && err !== null && "code" in err) {
    if (err.code === "P2002") return res.status(409).json({ error: "A record with this unique value already exists" });
    if (err.code === "P2025") return res.status(404).json({ error: "The requested record was not found" });
    if (err.code === "P2003") return res.status(400).json({ error: "The requested change conflicts with a related record" });
    if (err.code === "P2034") return res.status(409).json({ error: "The record changed during this operation. Please retry." });
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Uploaded file exceeds the configured size limit" });
    if (err.code === "LIMIT_UNEXPECTED_FILE") return res.status(400).json({ error: "Unexpected file upload field" });
  }
  if (config.NODE_ENV !== "production") console.error(err);
  return res.status(500).json({ error: "An unexpected server error occurred" });
});

// Vercel requires the entry module to default-export the Express app.
export default app;
