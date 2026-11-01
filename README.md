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
2. Replace `JWT_ACCESS_SECRET` with a cryptographically random secret of at least 32 characters. If you change the PostgreSQL password, update both Docker Compose's `POSTGRES_PASSWORD` and the API `DATABASE_URL`.
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
Active development. The development branch contains employee management, leave, overtime, documents, posting sites, disciplinary and recommendation screens, plus reporting and owner administration. It is **not production-ready yet**; wait for green CI, migration creation, database-backed tests, security review and production deployment hardening. See `docs/functional-specification.md` and `docs/technical-architecture.md` for agreed scope and architecture.
