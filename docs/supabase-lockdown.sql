-- Run once on the Supabase project after applying the Prisma migrations (and again if tables are added
-- outside Prisma). CIT-LMS reaches Postgres only through the Express API using the database owner role,
-- which bypasses row level security. Nothing in this schema should be reachable through Supabase's
-- public REST / GraphQL API with the anon or authenticated keys.
--
-- This file is Supabase-specific (the anon/authenticated roles do not exist on plain Postgres), so it is
-- deliberately NOT part of the Prisma migrations that CI applies to a stock Postgres container.

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Expected advisor output afterwards: "RLS enabled, no policy" (INFO) on every table. That is intentional:
-- with no policies the Data API sees no rows at all.
