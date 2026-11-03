# CIT-LMS production go-live checklist

This project keeps the final architecture: Next.js frontend, Express API, Prisma schema, and PostgreSQL as the source of truth. Supabase is used only as a managed PostgreSQL host and private document-storage backend when required by deployment.

## 1. Production environment

- Frontend: Next.js app served from the production host.
- API: Node.js Express service with JWT cookies and server-side role checks.
- Database: managed PostgreSQL instance, preferably Supabase Postgres or a comparable managed Postgres provider.
- Document storage: private bucket or equivalent secure object storage, not a public static path.

## 2. Database setup

1. Provision a managed PostgreSQL database.
2. Apply the Prisma schema with migrations in the API project.
3. Configure the API environment with a production database URL and the required secret values.
4. Confirm the app can connect and run the Prisma client in production.

Use the API project as the single source of truth for schema changes. Do not maintain a separate live SQL schema in the frontend repository.

## 3. Auth and authorization

- Keep authentication in the Express API, not in the browser.
- Use secure HTTP-only cookies for session transport.
- Keep role enforcement in server middleware and route guards.
- Require a trusted `Origin` or `Referer` on unsafe requests and reject cross-site Fetch Metadata.
- Do not trust frontend-only visibility as access control.

## 4. Document storage

- Create a private storage bucket for employee documents.
- Set `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET` on the API service only.
- Store only signed URLs or server-generated retrieval responses when files are requested.
- Prevent public access to the bucket and keep the storage path outside any public web root.
- Validate upload type, size, and file names before persisting.
- The API refuses to start if the configured bucket is missing or public.

## 5. Frontend environment

```env
NEXT_PUBLIC_API_URL=https://api.example.com
```

The browser should only know the API base URL. It should never receive a database secret, auth secret, or storage credentials.

## 6. Deployment commands

```bash
npm install
npm run build
npm run start --workspace @cit-lms/api
npm run start --workspace @cit-lms/web
```

For hosted deployment, keep the API and web app in separate runtime environments unless the platform explicitly supports both behind a single secure setup.

## 7. Smoke checklist

- Sign in and sign out with the API-issued cookie session.
- Load the dashboard and confirm role-based access.
- Create and read employee records.
- Submit leave and overtime records.
- Verify document upload and retrieval are restricted to the right roles.
- Confirm audit logs record protected changes.

## 8. Security hygiene

- Rotate all secrets before production launch.
- Never commit environment files.
- Use HTTPS only.
- Keep backups, retention, and restore drills in place.
- Review access control before exposing the application to real HR data.
