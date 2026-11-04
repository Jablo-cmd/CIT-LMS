# CIT-LMS

**CIT Employee Management & Leave Records System**

An internal HR records application for employee profiles, employment and posting history, leave transactions, weekend overtime, disciplinary records, recommendations and employee documents.

## Architecture

- **Frontend:** Next.js + React + TypeScript.
- **Application backend:** Node.js + Express + TypeScript.
- **Database:** Supabase-managed PostgreSQL.
- **Identity:** Supabase Auth.
- **File storage:** Existing private Supabase Storage bucket `cit-lms-documents`.
- **ORM:** Prisma, mapped to the existing database schema.
- **Hosting:** Vercel.

The browser talks to the Express API for protected HR workflows. The API validates Supabase Auth sessions, loads application roles from `public.profiles`, enforces permissions, and accesses PostgreSQL and private Storage with server-side credentials. Never expose `SUPABASE_SERVICE_ROLE_KEY` or database credentials to the browser.

## Requirements

- Node.js 22.12+ LTS
- npm 10.9+
- A dedicated non-production Supabase project or isolated PostgreSQL database for development

## Local setup

1. Copy `apps/api/env.template` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local`.
2. Configure `DATABASE_URL` to point to a dedicated development database. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for a development Supabase project if you need to test Auth and Storage. Never point local schema commands or seed scripts at production.
3. Install dependencies from the repository root: `npm install`.
4. Generate Prisma Client: `npm run db:generate --workspace @cit-lms/api`.
5. For a disposable development database only, create its schema with `cd apps/api && npx prisma db push`. This is not a production migration workflow.
6. If you need reference data in an isolated development database, opt in explicitly: `CIT_LMS_ALLOW_SEED=true npm run db:seed --workspace @cit-lms/api`. The seed script refuses production and Vercel execution.
7. Start the applications: `npm run dev`.

The frontend runs on http://localhost:3000 and the API on http://localhost:4000.

For a new, isolated development Supabase project, create the initial test Auth user through its Supabase Auth dashboard and create the corresponding `profiles` row in that development project only. The existing production project already has an active Company Owner profile; do not run bootstrap SQL or create another production owner.

## Database and production safety

- The existing CIT-LMS Supabase database is authoritative.
- The repository's original migration was incompatible and is archived under `apps/api/prisma/legacy-migrations/`, outside the active Prisma migration path.
- There is intentionally no production Prisma migration baseline yet.
- Do not run `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, or seed scripts against production.
- CI uses a disposable PostgreSQL service and creates only its temporary schema with Prisma `db push`.
- Any production schema change requires a separately reviewed migration plan and explicit approval.

See [docs/ARCHITECTURE_DECISION.md](docs/ARCHITECTURE_DECISION.md), [docs/SUPABASE_MIGRATION.md](docs/SUPABASE_MIGRATION.md), and [docs/PRODUCTION_SECURITY_REVIEW.md](docs/PRODUCTION_SECURITY_REVIEW.md).

## Security

- Never commit environment files, passwords, tokens, employee data, or uploaded documents.
- Keep Supabase Auth roles in `profiles`, not user-editable Auth metadata.
- Keep the service-role key server-only.
- Keep the document bucket private; the API must authorize all document operations.
- Use HTTPS, HttpOnly cookies, strict CORS/CSRF protections, tested backups, and least-privilege access.
- Review the existing production security findings before launch.

## Project status

The Supabase platform architecture and the first implementation/reconciliation slice are on `feat/supabase-platform-integration` with a draft pull request. Prisma schema mapping and API route updates have been implemented, but CI verification, live Auth/Storage integration, Vercel runtime configuration, and production release gates remain open. See [PR #3](https://github.com/Jablo-cmd/CIT-LMS/pull/3) and [docs/DEPLOYMENT_VERCEL.md](docs/DEPLOYMENT_VERCEL.md).
