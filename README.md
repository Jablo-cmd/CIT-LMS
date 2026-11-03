# CIT-LMS

**CIT Employee Management & Leave Records System**

An internal HR records application for employee profiles, employment and posting history, leave transactions, weekend overtime, disciplinary records, recommendations and employee documents.

## Technology
- Next.js + React + TypeScript frontend
- Node.js + Express + TypeScript API
- PostgreSQL database
- Prisma ORM
- Private local document storage during local development

## Requirements
- Node.js 22.12+ LTS
- npm 10+
- Docker Desktop (for local PostgreSQL)

## Local setup
1. Copy `apps/api/env.template` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local`.
2. Replace `JWT_ACCESS_SECRET` with a cryptographically random secret of at least 32 characters. The bundled database publishes on port `5433` to avoid conflicts with a host PostgreSQL service. If you change the PostgreSQL password, update both Docker Compose's `POSTGRES_PASSWORD` and the API `DATABASE_URL`.
3. Start PostgreSQL: `docker compose up -d postgres`.
4. Install dependencies from the repository root: `npm install`.
5. Generate Prisma Client: `npm run db:generate --workspace @cit-lms/api`.
6. Create the development migration: `npm run db:migrate --workspace @cit-lms/api -- --name init`.
7. Start both applications: `npm run dev`.

The frontend runs on http://localhost:3000 and the API on http://localhost:4000. After migrations and reference seeding, create the first account with `npm run owner:bootstrap --workspace @cit-lms/api`.

## Security
- Never commit environment files, passwords, employee data or uploaded documents.
- Use synthetic data only during development.
- Never expose the storage directory through static web hosting.
- Production requires HTTPS, secure cookies, managed secrets, tested backups, restricted network access, monitoring and a security review.
- No default owner account or production password is included. Owner provisioning must be a controlled, one-time process.

## Project status
Core modules are implemented and verified locally (unit tests, API smoke, production builds). Production still requires Vercel project configuration, Supabase Postgres and private document storage, owner bootstrap, and a production smoke test. See [docs/DEPLOYMENT_VERCEL.md](docs/DEPLOYMENT_VERCEL.md).
