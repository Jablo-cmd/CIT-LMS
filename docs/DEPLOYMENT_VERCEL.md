# CIT-LMS deployment on Vercel

CIT-LMS uses two Vercel projects from this monorepo: the Next.js website and the Express API. Supabase provides PostgreSQL and private document storage. The API remains responsible for authentication, role checks, and Prisma access.

## Create the Vercel projects

Import the GitHub repository twice in Vercel and set each project's **Root Directory**:

| Vercel project | Root Directory | Framework |
|----------------|----------------|-----------|
| CIT-LMS web | `apps/web` | Next.js |
| CIT-LMS API | `apps/api` | Express |

Vercel detects the Express app from `src/server.ts`; it runs as a Vercel Function. The browser must only ever talk to the **web** origin. Two separate `*.vercel.app` hostnames are different *sites* (`vercel.app` is a public suffix), so a browser calling the API directly would be rejected by the API's cross-site request guard and have its session cookie blocked as a third-party cookie. Use the web project's built-in `/api` proxy (below), or put both projects on subdomains of one domain you own.

## API environment variables

Configure these only on the **CIT-LMS API** project:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Random secret of at least 32 characters |
| `JWT_ACCESS_TTL` | `15m` |
| `COOKIE_SECURE` | `true` (the API refuses to start in production otherwise) |
| `COOKIE_SAMESITE` | `strict` (default). Use `none` only if the browser calls the API cross-site, which is not recommended |
| `WEB_ORIGIN` | Exact production web origin, with no trailing slash |
| `MFA_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts authenticator secrets at rest. **Required**: the API refuses to start in production without it. Store it as a *sensitive* variable and keep a copy in your password manager; losing or changing it makes every enrolled authenticator unusable (owners can then reset MFA, see below) |
| `MFA_REQUIRED` | Leave unset. Production defaults to `true`. Setting it to `false` is a deliberate, temporary opt-out: the API logs a warning on every start and users who already enrolled still use their codes. Remove it (or set `true`) and redeploy to enforce MFA again; anyone whose authenticator was cleared enrols again at their next sign-in |
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
| `API_PROXY_TARGET` | `https://<api-project>.vercel.app` (server-side only; the web project forwards `/api/*` here) |
| `NEXT_PUBLIC_API_URL` | `/api` |

With these two variables the browser calls `https://<web-domain>/api/...`, the web project proxies to the API, and the session cookie is first-party. Set `WEB_ORIGIN` on the API to the exact web origin. Both variables are read at build time, so redeploy the web project after changing them.

For local development leave `API_PROXY_TARGET` unset and use `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.

## Database migrations and first account

The `cit-lms` Supabase project already has the Prisma migrations applied, the reference data loaded and the Data API locked down (see `SUPABASE_MIGRATION.md`). For any later migration, run `npm run db:deploy --workspace @cit-lms/api` from a trusted environment with the **direct** database connection string; do not commit it.

Vercel deploys do not run migrations, so schema changes are always a separate release step. Never run `prisma migrate reset` against production.

Create the Company Owner once, from a trusted machine with the production `DATABASE_URL`, using `npm run owner:bootstrap --workspace @cit-lms/api`. It prompts for the password interactively and refuses to run if any user already exists. Use a unique password of at least 14 characters from a password manager.

## Production smoke test

- Confirm `https://<api-project>.vercel.app/api/health` reports a connected database.
- Sign in from the production web domain and verify the session cookie works.
- Upload a test document under 4 MiB and download it through the API.
- Confirm an administrative personnel account is denied identity and disciplinary files.
- Verify Supabase bucket remains private and backups/retention are configured.

Local files in `apps/api/storage` are not copied automatically to Supabase. Migrate any files that must be retained and preserve their object keys before switching an existing database to Supabase Storage.

## Two-step verification (MFA)

Every account must use an authenticator app (Microsoft/Google Authenticator or any TOTP app) in production.

- **First sign-in:** a user without MFA can sign in with their password but can only reach the *Security* page until they have scanned the QR code, confirmed a code and saved their ten one-time recovery codes. This applies to the Company Owner created by `owner:bootstrap` too.
- **Every sign-in after that** asks for the 6-digit code (or a recovery code). Wrong codes count towards the same 5-attempt, 15-minute lockout as wrong passwords, and a code cannot be used twice.
- **Lost phone:** a Company Owner opens *User administration* and chooses *Reset 2-step* for that person; they sign in with their password and enrol again. Their old sessions are ended.
- **The only owner is locked out** (no authenticator, no recovery codes): run this on a trusted machine with the production `DATABASE_URL` (direct connection):
  ```bash
  npm run owner:reset-mfa --workspace @cit-lms/api -- owner@example.com
  ```
- **Rotating `MFA_ENCRYPTION_KEY`** invalidates every stored authenticator secret. Reset MFA for all users afterwards, or avoid rotating it.
- Enrolment is open to anyone holding a correct password who has not enrolled yet, so enrol new accounts promptly (the owner should do it immediately after bootstrap).
