# CIT-LMS deployment on Vercel

CIT-LMS uses Next.js for the browser application and a Node.js/Express API for protected HR workflows. Supabase provides managed PostgreSQL, Auth, and private document Storage.

## Vercel projects

The monorepo can be deployed as two Vercel projects with separate root directories:

| Application | Root Directory | Framework |
|-------------|----------------|-----------|
| Web frontend | `apps/web` | Next.js |
| API backend | `apps/api` | Express |

The existing connected Vercel project confirmed during this work is `cit-lms-api`, with root directory `apps/api`. Confirm the web project and its domain separately before configuring production CORS.

## API environment variables

Configure these on the **CIT-LMS API** project only:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase PostgreSQL transaction-pooler connection string copied from the Supabase dashboard |
| `WEB_ORIGIN` | Exact production web origin, without a trailing slash |
| `COOKIE_SECURE` | `true` |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` | Existing Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase publishable key or legacy anon key, server-side for Auth API calls |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase secret for Auth Admin and private Storage |
| `SUPABASE_STORAGE_BUCKET` | `cit-lms-documents` |
| `MAX_UPLOAD_BYTES` | `4194304` (4 MiB) |

Do not prefix the service-role key with `NEXT_PUBLIC_`, do not put it in the web project, and never commit it. Do not paste secrets into source files or chat.

The current connected API Vercel project has the correct `SUPABASE_URL` configured for Production. The existing project did not have `DATABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` when inspected. These values are still required before runtime integration can be verified. Copy the exact transaction-pooler DSN and server key from the Supabase dashboard into Vercel's encrypted environment settings; the actual database password and service-role secret are not retrievable through this code branch.

Vercel Function request/response limits require the 4 MiB upload cap. Downloads should be authorized by the API and redirected to short-lived signed Storage URLs rather than streamed through a large function response.

## Web environment variables

Configure this on the **CIT-LMS web** project:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://<api-project>.vercel.app/api` |

The API client preserves the `/api` prefix whether the configured URL includes it or only contains the API origin.

## Database migration policy

The existing production Supabase database is authoritative and already contains the CIT-LMS schema and three active profile accounts. The original repository migration described a different schema and is archived under `apps/api/prisma/legacy-migrations/`, outside the active migration path.

There is intentionally no production Prisma migration baseline yet. Do **not** run `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, reset, or seed against production. CI uses Prisma `db push` only against a disposable PostgreSQL service; this is not a production migration.

Any production schema baseline or additive change must be separately designed, reviewed, backed up, and explicitly approved. The production database has not been modified by this branch.

## Preview and production verification

Before a production release:

1. Confirm the API and web Vercel projects, root directories, domains, and exact CORS origin.
2. Configure all API environment variables in Vercel without disclosing secret values.
3. Confirm the Supabase pooler DSN, Auth keys, private bucket name, and Storage permissions.
4. Verify CI Prisma validation, API/web typecheck, tests, build, and disposable database smoke test.
5. Deploy a preview and verify Auth login/refresh/logout, profile role enforcement, user provisioning, document upload/download, and denied access to identity/disciplinary files.
6. Review [the production security review](PRODUCTION_SECURITY_REVIEW.md), including exposed SECURITY DEFINER functions, password protection, Storage policy bucket mismatch, and missing foreign-key indexes.
7. Obtain explicit approval before any production migration or production deployment.

The existing production Company Owner profile already exists. Do not run the old owner bootstrap function or create another owner as part of deployment.
