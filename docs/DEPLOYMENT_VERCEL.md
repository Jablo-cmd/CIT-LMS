# CIT-LMS deployment on Vercel

CIT-LMS uses Next.js for the browser application and a Node.js/Express API for protected HR workflows. Supabase provides managed PostgreSQL, Auth, and private document Storage.

## Vercel projects

The monorepo can be deployed as two Vercel projects with separate root directories:

| Application | Root Directory | Framework |
|-------------|----------------|-----------|
| Web frontend | `apps/web` | Next.js |
| API backend | `apps/api` | Express |

Both Vercel projects exist in the `auris-nexus` team:

- API project: `cit-lms-api`, root directory `apps/api`, Vercel domain `cit-lms-api-auris-nexus.vercel.app`.
- Web project: `cit-lms`, root directory expected to be `apps/web`, custom domain `cit-bs.aurisnexus.co.za` and Vercel domains `cit-lms-auris-nexus.vercel.app` / `cit-lms-git-main-auris-nexus.vercel.app`.

Both projects currently report `live: false`; the web project's latest deployment was cancelled. The API has a successful preview build for commit `9f96b46929889f08fd1a526866e57311c65947b7`, but that does not verify runtime database/Auth connectivity.

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

The API Production environment was inspected without decrypting secrets. Confirmed present: `NODE_ENV=production`, `WEB_ORIGIN=https://cit-bs.aurisnexus.co.za`, `COOKIE_SECURE=true`, `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET=cit-lms-documents`, `MAX_UPLOAD_BYTES=4194304`, and the existing `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the API config accepts it as the Auth key fallback). Missing: `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Those two values are required before runtime integration can be verified. Copy the exact transaction-pooler DSN and server key from the Supabase dashboard into Vercel's encrypted environment settings; the actual database password and service-role secret are not retrievable through this code branch.

Vercel Function request/response limits require the 4 MiB upload cap. Downloads should be authorized by the API and redirected to short-lived signed Storage URLs rather than streamed through a large function response.

## Web environment variables

Configure this on the **CIT-LMS web** project:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | API origin, e.g. `https://<approved-api-domain>` (the client appends `/api`) |

The web project's current environment listing does not contain `NEXT_PUBLIC_API_URL`; the frontend therefore defaults to localhost. Set it only after the API's externally reachable production domain is confirmed.

## Database migration policy

The existing production Supabase database is authoritative and already contains the CIT-LMS schema and three active profile accounts. The original repository migration described a different schema and is archived under `apps/api/prisma/legacy-migrations/`, outside the active migration path.

There is intentionally no production Prisma migration baseline yet. Do **not** run `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, reset, or seed against production. CI uses Prisma `db push` only against a disposable PostgreSQL service; this is not a production migration.

Any production schema baseline or additive change must be separately designed, reviewed, backed up, and explicitly approved. The production database has not been modified by this branch.

## Deployment protection and cross-origin integration

Both Vercel projects currently have SSO protection enabled for all deployment domains except custom domains. The web custom domain `cit-bs.aurisnexus.co.za` is the configured production `WEB_ORIGIN`, but the API project has only Vercel-managed domains and no custom API domain. Before making the frontend call the API publicly, either assign an approved API custom domain or deliberately review the API project's SSO protection policy for the production deployment. Do not assume a browser on the public web domain can call an SSO-protected Vercel API domain.

The API uses HttpOnly cookies with `SameSite=None; Secure` in production. CORS and the CSRF Origin check must allow only the configured web origin. A trusted cross-origin browser request is permitted only when its Origin exactly matches `WEB_ORIGIN`.

## Preview and production verification

Before a production release:

1. Confirm the API and web Vercel projects, root directories, domains, API SSO protection, and exact CORS origin.
2. Configure all API environment variables in Vercel without disclosing secret values.
3. Confirm the Supabase pooler DSN, Auth keys, private bucket name, and Storage permissions.
4. Verify CI Prisma validation, API/web typecheck, tests, build, and disposable database smoke test.
5. Deploy a preview and verify Auth login/refresh/logout, profile role enforcement, user provisioning, document upload/download, and denied access to identity/disciplinary files.
6. Review [the production security review](PRODUCTION_SECURITY_REVIEW.md), including exposed SECURITY DEFINER functions, password protection, Storage policy bucket mismatch, and missing foreign-key indexes.
7. Obtain explicit approval before any production migration or production deployment.

The existing production Company Owner profile already exists. Do not run the old owner bootstrap function or create another owner as part of deployment.
