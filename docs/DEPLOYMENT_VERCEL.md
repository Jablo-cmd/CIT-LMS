# CIT-LMS deployment on Vercel

CIT-LMS uses two Vercel projects from this monorepo: the Next.js website and the Express API. Supabase provides PostgreSQL and private document storage. The API remains responsible for authentication, role checks, and Prisma access.

## Create the Vercel projects

Import the GitHub repository twice in Vercel and set each project's **Root Directory**:

| Vercel project | Root Directory | Framework |
|----------------|----------------|-----------|
| CIT-LMS web | `apps/web` | Next.js |
| CIT-LMS API | `apps/api` | Express |

Vercel detects the Express app from `src/server.ts`; it runs as a Vercel Function. The API and web projects can use separate Vercel hostnames. Set the API URL on the web project to the API project's URL followed by `/api`.

## API environment variables

Configure these only on the **CIT-LMS API** project:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Random secret of at least 32 characters |
| `JWT_ACCESS_TTL` | `15m` |
| `COOKIE_SECURE` | `true` |
| `WEB_ORIGIN` | Exact production web origin, with no trailing slash |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase secret |
| `SUPABASE_STORAGE_BUCKET` | `cit-lms-documents` (private bucket) |
| `MAX_UPLOAD_BYTES` | `4194304` (4 MiB) |

Vercel Function request and response bodies are limited to 4.5 MB. The 4 MiB upload cap leaves room for multipart form overhead. Document and photo downloads redirect to a short-lived signed Supabase URL after the API authorizes the request, avoiding the response-body limit. Never place the service-role key on the web project.

## Web environment variables

Configure this on the **CIT-LMS web** project:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://<api-project>.vercel.app/api` |

The API client preserves the `/api` prefix whether the configured URL includes it or only contains the API origin.

## Database migrations and first account

Apply Prisma migrations to the production database before the first production API deployment. Run `npm run db:deploy --workspace @cit-lms/api` from a trusted environment configured with the production `DATABASE_URL`; do not commit that connection string. Seed reference data with `npm run db:seed --workspace @cit-lms/api`, then create the Company Owner once with `npm run owner:bootstrap --workspace @cit-lms/api`.

Vercel deploys do not run the API's local `start` script, so migrations must be applied as a separate release step. Never run `prisma migrate reset` against production.

## Production smoke test

- Confirm `https://<api-project>.vercel.app/api/health` reports a connected database.
- Sign in from the production web domain and verify the session cookie works.
- Upload a test document under 4 MiB and download it through the API.
- Confirm an administrative personnel account is denied identity and disciplinary files.
- Verify Supabase bucket remains private and backups/retention are configured.

Local files in `apps/api/storage` are not copied automatically to Supabase. Migrate any files that must be retained and preserve their object keys before switching an existing database to Supabase Storage.