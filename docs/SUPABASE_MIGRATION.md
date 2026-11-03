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
