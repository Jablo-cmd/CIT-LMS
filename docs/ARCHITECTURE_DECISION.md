# Architecture decision: Supabase platform with a Node.js application API

**Status:** Accepted for implementation  
**Branch:** `feat/supabase-platform-integration`  
**Production impact:** None. This branch contains application-code changes only; no production SQL, migrations, seeds, account changes, storage changes, or deployments were run.

## Decision

CIT-LMS uses Supabase as its managed platform for PostgreSQL, Auth, and private Storage. The separate Node.js/Express TypeScript API remains the application boundary for business rules, validation, role checks, audit events, and access to sensitive HR data. Next.js/TypeScript remains the browser application. Vercel hosts the web and API applications.

Supabase is not restricted to object storage. It is the provider for the system's database and identity service as well.

## Responsibilities

- **Next.js + TypeScript:** browser UI, forms, dashboards, and calls to the API.
- **Node.js + Express + TypeScript:** business logic, API authorization, validation, auditing, reporting, and server-side orchestration.
- **Supabase PostgreSQL:** canonical CIT-LMS relational data.
- **Supabase Auth:** password verification, access/refresh sessions, and user lifecycle.
- **Supabase Storage:** private employee documents in the existing `cit-lms-documents` bucket.
- **Prisma:** typed database access mapped onto the existing Supabase schema; it must not create a parallel schema.
- **Vercel:** application hosting.

## Authentication and authorization

The API validates Supabase Auth access tokens with the Auth user endpoint. It then loads the matching `public.profiles` row and uses its `role` and `is_active` values for application authorization. Role authorization must not use user-editable Auth metadata.

The browser receives only HttpOnly access/refresh cookies. The service-role key is server-only and must never be exposed through a `NEXT_PUBLIC_` variable. User provisioning and password resets are performed through the Supabase Auth Admin API by the API server. A profile is not automatically authorized merely because an Auth identity exists; an active profile with an approved application role is required.

## Production configuration still required

The API requires a real Supabase Postgres connection string in `DATABASE_URL`, `SUPABASE_URL`, a server-side `SUPABASE_ANON_KEY` (or publishable key), and `SUPABASE_SERVICE_ROLE_KEY`. Never commit their values. The existing production Vercel project previously lacked `DATABASE_URL`; it must be configured from the Supabase dashboard before a runtime database connection can be tested.

## Database safety and schema alignment

The existing production project is authoritative. It contains `profiles` linked to `auth.users`, HR tables with UUID primary/foreign keys, and the existing private documents bucket. The repository's original Prisma migration creates a different schema and must not be deployed to that project.

The branch now maps the Prisma models, scalar fields, enums, UUIDs, indexes, and relations to the read-only production catalog snapshot. API routes have been updated for the actual document foreign keys, leave transaction fields, working schedule notes, public holiday composite key, and required leave-policy creator. This is a code/schema reconciliation, not proof of live CRUD correctness; it still needs CI validation and integration tests against the disposable CI database.

No production migration history baseline exists. Do not run `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, or the seed script against production. CI uses `prisma db push` only against its disposable PostgreSQL service. The seed script now requires explicit `CIT_LMS_ALLOW_SEED=true` and refuses production/Vercel execution. Establish and review a safe baseline separately after the schema mapping is complete.

## Delivery gates

1. Complete CI validation of the reconciled Prisma schema and API routes.
2. Add deeper integration tests against the disposable schema and isolated Auth test users.
4. Run Prisma validation/generation, API/web typechecks, tests, and production build.
5. Review security (RLS, Auth, cookies, CORS/CSRF, private Storage, key exposure).
6. Configure required Vercel environment variables without exposing secret values.
7. Deploy only to a preview environment and verify before any production release.
8. Create a migration baseline/reconciliation plan; production migration execution requires a separate explicit approval.

## Work performed on this branch

- Added server-side Supabase Auth API helpers for password sign-in, user validation, refresh, sign-out, and Admin API provisioning/password updates.
- Replaced the API's custom JWT/password-hash login middleware and routes with Supabase Auth sessions plus profile-backed roles.
- Updated protected user creation/password reset to use Supabase Auth Admin APIs and compensate by deleting the new identity if profile/audit creation fails.
- Retired the local password-based owner bootstrap and replaced the old destructive smoke script with a read-only API health check.
- Updated Prisma config so code generation in the build/typecheck lifecycle can use a non-routable placeholder DSN when no real DB URL is present; database CLI operations still require an explicit `DATABASE_URL`.
- Reconciled all Prisma models to the production catalog snapshot, including UUIDs, native dates/timestamps, enum mappings, numeric precision, real table/column names, production index names, and document/leave foreign-key relations.
- Updated employee, document, leave, overtime, disciplinary, recommendation, history, calendar, and reporting routes to use existing production columns.
- Added a compatibility view for document filenames: the live schema stores title and MIME type, not original filename or description; the API derives a safe download filename and returns a null description rather than claiming absent metadata exists.
- Archived the incompatible initial migration outside the active Prisma migrations path; CI now builds a disposable schema from the reconciled Prisma models and does not run the old migration or seed data.
- Added an explicit opt-in guard to the seed script and tests for document metadata compatibility.
- Added a read-only production security review at `docs/PRODUCTION_SECURITY_REVIEW.md`.

## Not yet done / not claimed

- Successful latest CI validation/typecheck/tests/build and database smoke test (awaiting the current workflow result).
- End-to-end Auth and document-storage integration tests against an isolated Supabase test project.
- Preview deployment or live Auth integration test.
- Production environment-variable completion: `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` remain unavailable in the existing Vercel project.
- Production migration or deployment.
