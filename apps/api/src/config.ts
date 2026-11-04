import "dotenv/config";
import { z } from "zod";
export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_ROOT: z.string().default("./storage"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("cit-lms-documents"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(() => process.env.VERCEL === "1" ? 4_194_304 : 10_485_760)
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && value.STORAGE_DRIVER !== "supabase") ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "Production requires private Supabase Storage" });
  if (value.NODE_ENV === "production" && value.COOKIE_SECURE !== "true") ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "Production authentication cookies must be Secure" });
  if (value.NODE_ENV === "production" && value.WEB_ORIGIN === "http://localhost:3000") ctx.addIssue({ code: "custom", path: ["WEB_ORIGIN"], message: "Production requires the exact deployed web origin" });
  if (value.STORAGE_DRIVER === "supabase" || value.NODE_ENV === "production") {
    if (!value.SUPABASE_URL) ctx.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "SUPABASE_URL is required" });
    if (value.NODE_ENV === "production" && !value.SUPABASE_ANON_KEY) ctx.addIssue({ code: "custom", path: ["SUPABASE_ANON_KEY"], message: "A Supabase anon/publishable key is required for Auth" });
    if (!value.SUPABASE_SERVICE_ROLE_KEY) ctx.addIssue({ code: "custom", path: ["SUPABASE_SERVICE_ROLE_KEY"], message: "SUPABASE_SERVICE_ROLE_KEY is required for privileged server operations and Storage" });
  }
  if (process.env.VERCEL === "1" && value.MAX_UPLOAD_BYTES > 4_194_304) ctx.addIssue({ code: "custom", path: ["MAX_UPLOAD_BYTES"], message: "Vercel uploads must be limited to 4 MiB" });
});
export const config = configSchema.parse({ ...process.env, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
