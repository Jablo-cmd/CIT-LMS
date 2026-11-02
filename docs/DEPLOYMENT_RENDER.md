# CIT-LMS production / staging deployment on Render

## Services required

1. **PostgreSQL** — managed Render Postgres (or external equivalent).
2. **API web service** — Node service for `apps/api` (Node **22.12+**).
3. **Web service** — Next.js for `apps/web` (Node **22.12+**).
4. **Document storage** — attach a **persistent disk** to the API service, or use S3-compatible object storage. Without a disk or object store, uploaded employee documents are lost on redeploy.

## Environment variables (API)

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_ENV` | yes | `production` |
| `PORT` | auto | Render sets this; do not hardcode |
| `DATABASE_URL` | yes | Internal Render Postgres URL preferred |
| `JWT_ACCESS_SECRET` | yes | Random ≥32 characters (Render secret) |
| `JWT_ACCESS_TTL` | no | Default `15m` |
| `COOKIE_SECURE` | yes | `true` in production (enables Secure + SameSite=None for cross-origin cookies) |
| `WEB_ORIGIN` | yes | Exact frontend origin, e.g. `https://cit-lms-web.onrender.com` (no trailing slash) |
| `STORAGE_ROOT` | yes | e.g. `/var/data/cit-lms-storage` when using a Render disk |
| `MAX_UPLOAD_BYTES` | no | Default `10485760` (10 MiB) |

## Environment variables (Web)

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_API_URL` | yes | Public API base **including** `/api`, e.g. `https://cit-lms-api.onrender.com/api` |

## Build and start commands

Root directory for both services: repository root (monorepo).

**API**

- Build: `npm install && npm run build --workspace @cit-lms/api`
- Start: `npm run db:deploy --workspace @cit-lms/api && npm run start --workspace @cit-lms/api`
- Health check path: `/api/health`

**Web**

- Build: `npm install && npm run build --workspace @cit-lms/web`
- Start: `npm run start --workspace @cit-lms/web`

## First-time database setup

1. Deploy API so migrations run (`db:deploy`).
2. Optionally seed reference data (departments, sites, holidays) from a one-off shell:

```bash
npm run db:seed --workspace @cit-lms/api
```

3. Create the Company Owner **once** (interactive, no default password in repo):

```bash
npm run owner:bootstrap --workspace @cit-lms/api
```

## Cross-origin auth (important)

API and web typically run on different `*.onrender.com` hosts. The API sets an `httpOnly` cookie on the **API** host. With `COOKIE_SECURE=true`, cookies use `SameSite=None` so the browser sends them on credentialed XHR/fetch from the web origin. `WEB_ORIGIN` must match the web URL exactly for CORS.

## Backups and recovery

1. Enable automated daily backups on managed Postgres.
2. Test restore into a non-production database before go-live.
3. Back up the document disk / object store separately.
4. Never run `prisma migrate reset` against production.

## Security checklist

- [ ] HTTPS only; `COOKIE_SECURE=true`
- [ ] `WEB_ORIGIN` locked to the real frontend origin
- [ ] Secrets only in Render environment (never in git)
- [ ] Owner bootstrap completed offline / via Render shell
- [ ] No sample accounts committed
- [ ] Document storage on persistent disk or object storage
- [ ] Staging smoke: login, create synthetic employee, upload PDF, capture leave

## Outstanding business decisions

- Annual leave entitlement days and monthly accrual rates
- Carry-over limits and forfeiture dates
- Contract vs permanent policy differences
- Disciplinary document retention under POPIA / company policy
