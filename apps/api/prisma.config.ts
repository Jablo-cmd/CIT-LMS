import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` (run by every build) never connects to the database, so it must not require
// DATABASE_URL: Vercel preview builds are deliberately kept free of production database credentials.
// Commands that do connect (migrate deploy/dev, db seed) fail loudly below when it is missing.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {})
});
