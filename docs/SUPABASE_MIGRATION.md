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

The repository's Prisma mapping work is in progress. Do not use Prisma migrations, `db push`, or the seed script against production until every model, column, enum, and relationship has been reconciled and a reviewed baseline plan has been approved. No production schema/data changes are part of this branch.

## Storage

The existing bucket must remain private. The API verifies bucket privacy at startup, authorizes document access, and uses server-generated signed URLs/proxying. Do not make the bucket public or grant browser clients broad access to employee documents.

## Deployment checklist

1. Configure server-only environment variables in Vercel without disclosing their values.
2. Confirm the runtime Postgres pooler DSN.
3. Complete Prisma schema and route reconciliation.
4. Run tests against an isolated test database and test Auth users.
5. Verify CORS, CSRF, cookies, roles, RLS, and Storage access.
6. Deploy a preview and verify end-to-end before considering a production release.
