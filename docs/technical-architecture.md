# CIT-LMS Technical Architecture

**Status:** Supabase platform architecture accepted; implementation and production schema reconciliation are in progress.

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
- RLS remains an additional database security layer; API checks do not justify exposing unrestricted table access to the browser.

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

The Prisma reconciliation is not complete. No production migrations, `db push`, seed, reset, or data modifications are authorized by this architecture decision. Complete the schema mapping and validate against an isolated test database first. Create and review a baseline/reconciliation plan separately before any production migration.

## 7. Deployment gate

Before production release:
- Complete Prisma model/column/enum/relation mappings and update API queries.
- Run Prisma validation/generation, TypeScript checks, unit/integration tests, and production build.
- Configure the runtime database pooler DSN and server-side Supabase keys in Vercel.
- Verify Auth, roles, CSRF/CORS, RLS, and private Storage in a preview environment.
- Confirm backups and tested restoration.
- Obtain explicit approval for production release and any schema migration.
