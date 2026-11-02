# CIT-LMS Supabase migration

Branch: `feature/supabase-migration`

## Architecture

| Concern | Before | After |
|---------|--------|--------|
| Database | Self-hosted Postgres + Prisma | Supabase Postgres |
| Auth | Express JWT cookie | Supabase Auth |
| Authorisation | Express allowRoles | RLS + profiles.role |
| Documents | Local filesystem | Private bucket employee-documents |
| Leave calc | Node service | SQL RPCs + TS parity |
| Frontend | Next.js to Express | Next.js to Supabase |

Roles: COMPANY_OWNER, HR_MANAGER, ADMIN_PERSONNEL (stored only in public.profiles).

## Migrations (apply in order)

1. `supabase/migrations/20261102120000_init_cit_lms.sql` — tables + leave RPCs
2. `supabase/migrations/20261102120050_rls_and_grants.sql` — RLS
3. `supabase/migrations/20261102120100_storage_and_seed_helpers.sql` — storage + owner bootstrap

## Setup

1. Create Supabase project; disable public sign-ups.
2. Run the three SQL migrations (Dashboard SQL or `supabase db push`).
3. Create Auth user; as service_role call `select public.bootstrap_owner_profile('<uuid>', 'email', 'Name');`
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on the web app.
5. Never expose the service_role key to the browser.

## Status

| Item | Status |
|------|--------|
| Schema + RLS + leave RPC | Implemented |
| Storage policies | Implemented |
| Auth login + middleware session | Implemented on branch |
| Remaining screens still on Express api.ts | Dual-run pending |
| Live Supabase project / RLS live tests | Requires your project |
| Express/Prisma removal | After full page cutover |
