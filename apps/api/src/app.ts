import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
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
import { requireAuth } from "./middleware/auth.js";
import { protectCookieMutations } from "./middleware/csrf.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.NODE_ENV === "production" ? 1 : false);
app.use(helmet());
app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/api", protectCookieMutations);
app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));
app.use("/api/auth/change-password", rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false }));
app.use("/api/users/:id/reset-password", rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false }));
app.get("/api/health", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; return res.json({ status: "ok", database: "connected", service: "cit-lms-api" }); }
  catch { return res.status(503).json({ status: "unavailable", database: "unavailable", service: "cit-lms-api" }); }
});
app.use("/api/auth", authRouter);
app.use("/api", requireAuth);
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
