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

The Prisma `User` model has been started as a mapping to `public.profiles`, and identifiers/table names have begun to be aligned. This is **not yet a complete Prisma schema reconciliation**. Several other models still have field/relationship mismatches (notably document foreign keys, leave transaction fields, working schedules, public holidays, and policy fields). Runtime CRUD must not be considered production-ready until all model mappings and route queries are reconciled and tested against a disposable schema clone or isolated test project.

No production migration history baseline exists. Do not run `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, or the seed script against production. Establish and review a safe baseline separately after the schema mapping is complete.

## Delivery gates

1. Complete Prisma model/column/enum/relation mapping from a read-only schema snapshot.
2. Update API queries and document metadata handling to match actual columns.
3. Add unit/integration tests using a disposable test database and isolated Auth test users.
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
- Began mapping Prisma `User` to `profiles`, UUID identifiers, snake_case scalar fields, table names, and enum names.

## Not yet done / not claimed

- Full Prisma schema reconciliation and all API route updates.
- Successful local or CI typecheck/test/build (the connector used to edit GitHub files does not execute repository commands).
- Preview deployment or live Auth integration test.
- Production environment-variable completion.
- Production migration or deployment.
