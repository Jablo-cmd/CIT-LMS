# Supabase platform integration

CIT-LMS uses the existing Supabase project for managed PostgreSQL, Auth, and private document storage. The Express API remains the application backend and the only application-facing data/business-logic boundary.

## Responsibilities

- Supabase PostgreSQL stores CIT-LMS application records.
- Supabase Auth manages user credentials and sessions.
- Supabase Storage stores employee documents in the existing private `cit-lms-documents` bucket.
- The Node.js API validates Auth sessions, loads role and active status from `public.profiles`, enforces permissions, applies business rules, and performs privileged operations.
- The Next.js app calls the API; it must not receive the service-role key or directly bypass API authorization for sensitive HR records.

## Server environment

The API requires:

- `DATABASE_URL`: Supabase PostgreSQL connection string. Prefer the transaction pooler for serverless runtime connections, using the exact DSN and port supplied by the Supabase dashboard.
- `SUPABASE_URL`: project URL.
- `SUPABASE_ANON_KEY`: publishable key or legacy anon key used for Auth API requests.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key for Auth Admin API and private Storage.
- `SUPABASE_STORAGE_BUCKET=cit-lms-documents`.
- `STORAGE_DRIVER=supabase` in production.

Never expose the service-role key through a `NEXT_PUBLIC_` variable or commit any real secret to Git.

## Authentication

The API signs users in through Supabase Auth, stores the access and refresh tokens in HttpOnly cookies, validates access tokens with Supabase Auth, refreshes expired sessions, and loads the corresponding `profiles` record. Application role and active status are read from the profile row, not from user-editable user metadata. User provisioning and password resets use the Supabase Auth Admin API on the server.

## Existing production database safety

The existing production Supabase project is authoritative. Its schema predates the repository's original Prisma migration and has different UUID, column, and relation definitions. The original migration is not a production migration and must not be deployed to the existing project.

The branch now maps Prisma models and API queries to the read-only production catalog snapshot. The original incompatible migration is archived outside the active migrations path. CI uses `prisma db push` only against a disposable PostgreSQL service; this is not a production migration. The seed script requires explicit `CIT_LMS_ALLOW_SEED=true` and refuses production/Vercel execution. Do not run `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, or seed against production. No production schema/data changes are part of this branch.

## Storage

The existing `cit-lms-documents` bucket is private. The API uses server-side Storage operations and must authorize every upload/download. Existing Storage policies reference the different id `employee-documents`; do not assume those policies protect the actual bucket. The service-role key bypasses Storage RLS and must remain server-only. The API derives a download filename from the stored title and MIME type because the existing table has no original-filename or description columns.

## Deployment checklist

1. Configure server-only environment variables in Vercel without disclosing their values.
2. Confirm the runtime Postgres pooler DSN.
3. Confirm CI schema validation, route typecheck, tests, build, and disposable database smoke test.
4. Run tests against an isolated test database and test Auth users.
5. Review the findings in `docs/PRODUCTION_SECURITY_REVIEW.md`; verify CORS, CSRF, cookies, roles, RLS, and Storage access.
6. Deploy a preview and verify end-to-end before considering a production release.
