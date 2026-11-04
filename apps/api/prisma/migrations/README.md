# Prisma migrations

There is intentionally no active production migration baseline in this directory.

The existing CIT-LMS Supabase database predates the repository migration and already contains the authoritative schema. The original repository migration is archived under `prisma/legacy-migrations/` because it creates incompatible parallel tables.

Do not run `prisma migrate deploy`, `prisma migrate dev`, or `prisma db push` against the production Supabase project. CI creates a disposable PostgreSQL schema from the reconciled Prisma models using `prisma db push`; this is not a production migration or baseline.

A migration baseline and any additive production DDL must be separately designed, reviewed, and explicitly approved before use.
