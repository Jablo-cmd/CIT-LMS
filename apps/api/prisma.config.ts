import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma Client generation does not connect to PostgreSQL. Allow Vercel's
// build/typecheck lifecycle to generate the client without a production DSN.
// Every migration/seed/other Prisma CLI lifecycle still requires DATABASE_URL.
const codegenOnly = ["build", "typecheck"].includes(process.env.npm_lifecycle_event ?? "");
const datasourceUrl = process.env.DATABASE_URL ?? (
  codegenOnly ? "postgresql://codegen:codegen@127.0.0.1:5432/codegen" : undefined
);
if (!datasourceUrl) {
  throw new Error("DATABASE_URL is required for Prisma database commands. It is intentionally not defaulted outside build/typecheck.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: { url: datasourceUrl }
});
