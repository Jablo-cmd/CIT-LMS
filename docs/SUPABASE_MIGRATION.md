# Managed Postgres and storage notes

The final architecture keeps Prisma and the Express API as the system source of truth. Supabase is only used where it adds value: managed PostgreSQL hosting and private document storage.

## Allowed use

- Postgres hosting for the application database.
- Private object storage for employee documents and signed-file retrieval.
- Secure deployment-level configuration, not browser authentication.

## Not allowed in this project

- Supabase Auth as the primary session system.
- Supabase client-side auth flows in the Next.js app.
- Replacing the Prisma schema with a separate Supabase schema.
- Public storage buckets or direct client-to-storage access for employee documents.

## Configuration pattern

1. Configure the API with the managed Postgres connection string.
2. Run Prisma migrations from the API project.
3. Keep the browser app pointed at the API base URL.
4. Use a separate private bucket for documents and generate files only through the backend.

The API requires `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET` in production. It validates that the bucket exists and is not public before listening. The service-role key must never be set in the web app. Downloads are authorized by Express, fetched through an internally generated 60-second signed URL, and proxied to the caller.

This keeps the platform choice flexible without creating a second auth or data layer in the application.


## Production database status (cit-lms project)

- The earlier Supabase-native schema (a `profiles` table, RLS policies and `SECURITY DEFINER` RPC functions, some of them callable by anonymous users) was removed. It was empty and is not used by this application.
- The Prisma migrations were applied and recorded in `_prisma_migrations`, so `npm run db:deploy --workspace @cit-lms/api` treats the database as up to date and applies only new migrations.
- Reference data (departments, posting sites, the standard schedule and public holidays to 2035) was loaded and verified against the output of `prisma/seed.ts`.
- `docs/supabase-lockdown.sql` was applied: row level security is on for every table and the `anon` / `authenticated` roles have no privileges, so the Supabase Data API exposes nothing. Re-run it if you ever add tables outside Prisma, then check the Supabase security advisors.
- A private `cit-lms-documents` bucket exists. The API verifies at start-up that it is private.

## Connection strings

- **API runtime (Vercel):** use the Supabase **connection pooler** string (transaction mode, port 6543) as `DATABASE_URL`. Serverless functions open many short-lived connections, and the direct host is IPv6-only unless the IPv4 add-on is enabled.
- **Migrations:** run `prisma migrate deploy` from a trusted machine with the **direct** or **session-mode** string. Do not run migrations through the transaction pooler.
- Never commit either string. Rotate the database password if it has ever been shared in chat or a ticket.
