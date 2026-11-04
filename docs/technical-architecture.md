# CIT-LMS Technical Architecture

**Status:** Supabase platform architecture accepted; Prisma and API schema reconciliation implemented on `feat/supabase-platform-integration`; CI verification and live integration gates remain.

## 1. Confirmed technology direction

- **Language:** TypeScript across frontend and backend.
- **Frontend:** Next.js.
- **Application backend:** Node.js + Express REST API.
- **Database:** Supabase-managed PostgreSQL.
- **Authentication:** Supabase Auth, with application roles/active status stored in `public.profiles`.
- **File storage:** Existing private Supabase Storage bucket `cit-lms-documents`.
- **ORM:** Prisma, mapped to the existing database schema; it must not create parallel tables.
- **Hosting:** Vercel for the Next.js frontend and Node.js API.

## 2. Repository structure

```
CIT-LMS/
├── apps/
│   ├── web/                 # Next.js + TypeScript frontend
│   └── api/                 # Node.js + TypeScript backend
├── docs/
│   ├── functional-specification.md
│   ├── technical-architecture.md
│   └── ARCHITECTURE_DECISION.md
└── package.json
```

## 3. Application responsibilities

### Next.js frontend
- Responsive browser-based interface.
- Employee directory and profile screens.
- HR capture forms and reports.
- Role-aware navigation and user experience.
- Communicates with the backend through the REST API.
- Never receives the Supabase service-role key.

### Node.js backend
- Validates Supabase Auth sessions and refreshes expired access tokens.
- Loads application identity, role, and active status from `profiles`.
- Enforces server-side authorization; hiding a button is never access control.
- Owns business rules, validation, employee/leave/overtime/history workflows, reporting, and audit events.
- Accesses PostgreSQL and private Storage using server-side credentials.
- Uses the Supabase Auth Admin API for user provisioning and password administration.

### Supabase platform
- PostgreSQL is the canonical application database.
- Auth is the identity and credential provider.
- Private Storage holds employee documents and photos.
- RLS is enabled on the existing public application tables and protects direct Data API access. The API uses a trusted server-side PostgreSQL connection and privileged Storage key, so route-level authorization is mandatory and RLS is not assumed to be the API authorization boundary.

## 4. Data design principles

- Preserve the existing production schema and user identities.
- Use UUIDs for primary/foreign keys where the existing schema defines UUIDs.
- Map Prisma models, scalar fields, enums, and relations to the existing snake_case database.
- Preserve immutable original hire date.
- Model position appointments and posting assignments as dated history records.
- Keep leave transactions auditable and use adjustments/reversals rather than rewriting ledger history.
- Record actor and timestamps for important create/update actions.

## 5. Security and privacy

- Never commit secrets, passwords, tokens, production database dumps, or employee files.
- Store the service-role key only in server-side environment configuration.
- Use HttpOnly cookies for API sessions, HTTPS in production, strict CORS and CSRF protections.
- Do not authorize from user-editable Auth metadata.
- Keep the document bucket private; use server-side authorization and short-lived signed URLs.
- Enforce least privilege and test role boundaries.
- Define encrypted backups, retention, restore testing, and incident procedures before production.

## 6. Database and migration safety

The existing Supabase project is authoritative. Its current schema differs from the original repository Prisma schema. The initial repository migration would create a conflicting schema and must not be deployed to production.

The branch maps Prisma models, fields, enums, numeric precision, indexes, and relations to the existing schema. API route queries have been updated accordingly. CI runs `prisma db push` only against its disposable PostgreSQL service. The old incompatible initial migration is archived outside the active migration path, and the seed script requires explicit opt-in while refusing production/Vercel execution. No production migrations, `db push`, seed, reset, or data modifications are authorized. A production baseline/additive migration plan requires separate review and explicit approval.

## 7. Deployment gate

Before production release:
- Confirm CI Prisma validation, typecheck, tests, build, and disposable database smoke test.
- Run Prisma validation/generation, TypeScript checks, unit/integration tests, and production build.
- Configure the runtime database pooler DSN and server-side Supabase keys in Vercel.
- Resolve or explicitly accept the existing Supabase security findings documented in `docs/PRODUCTION_SECURITY_REVIEW.md`.
- Verify Auth, roles, CSRF/CORS, RLS, and private Storage in an isolated preview environment.
- Confirm backups and tested restoration.
- Obtain explicit approval for production release and any schema migration.
