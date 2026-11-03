import "dotenv/config";
import { z } from "zod";

export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_ROOT: z.string().default("./storage"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("cit-lms-documents"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(() => process.env.VERCEL === "1" ? 4_194_304 : 10_485_760)
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && value.STORAGE_DRIVER !== "supabase") {
    ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "Production requires private Supabase Storage" });
  }
  if (value.STORAGE_DRIVER === "supabase") {
    if (!value.SUPABASE_URL) ctx.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "SUPABASE_URL is required for Supabase Storage" });
    if (!value.SUPABASE_SERVICE_ROLE_KEY) ctx.addIssue({ code: "custom", path: ["SUPABASE_SERVICE_ROLE_KEY"], message: "SUPABASE_SERVICE_ROLE_KEY is required for Supabase Storage" });
  }
  if (process.env.VERCEL === "1" && value.MAX_UPLOAD_BYTES > 4_194_304) {
    ctx.addIssue({ code: "custom", path: ["MAX_UPLOAD_BYTES"], message: "Vercel uploads must be limited to 4 MiB to fit within the function request-body limit" });
  }
});

export const config = configSchema.parse(process.env);
