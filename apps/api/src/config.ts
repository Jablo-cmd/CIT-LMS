import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  STORAGE_ROOT: z.string().default("./storage"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760)
});

export const config = schema.parse(process.env);
