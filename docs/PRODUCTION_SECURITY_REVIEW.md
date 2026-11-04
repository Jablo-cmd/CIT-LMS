# Production Supabase security review

**Project:** `cit-lms` (`ziodtqecvocyrkwgxqop`)  
**Review date:** 2026-11-04  
**Method:** Read-only catalog queries, Supabase table metadata, RLS policy inspection, and Supabase security/performance advisors.  
**Production changes:** None. This review did not execute DDL, DML, Auth account changes, Storage changes, migrations, or seeds.

## Confirmed baseline

- All 15 application tables in `public` have Row Level Security enabled.
- Three existing profiles are active: one `COMPANY_OWNER`, one `HR_MANAGER`, and one `ADMIN_PERSONNEL`. Their identity details were not copied into this review.
- `profiles.id` references `auth.users.id`.
- An `auth.users` UPDATE trigger named `on_auth_user_updated` invokes `public.handle_auth_user_updated()` to synchronize profile email and `updated_at`. No public-schema INSERT trigger was found.
- The existing private bucket is `cit-lms-documents`.
- Existing Storage RLS policies refer to bucket id `employee-documents`, not `cit-lms-documents`. The API integration therefore uses server-side Storage operations and must perform authorization itself. Do not expose the service-role key or add direct browser access as a workaround.

## Security advisor findings requiring review

Supabase's security advisor returned the following warnings on the existing production project:

1. **Public execution of SECURITY DEFINER functions.** The advisor reports nine public-schema SECURITY DEFINER functions executable by `anon`, and eight executable by `authenticated`. The functions include:
   - `bootstrap_owner_profile(p_user_id uuid, p_email text, p_full_name text)`
   - `calculate_working_leave_days(uuid,date,date)`
   - `can_access_document_object(text)`
   - `capture_leave_deduction(...)`
   - `current_role()`, `handle_auth_user_updated()`, `is_hr_or_owner()`, `is_owner()`, and `is_staff()`

   The current `bootstrap_owner_profile` body refuses to create an owner if an active owner already exists, and the read-only check found one active Company Owner profile. Nevertheless, an anonymous caller can invoke the function, and its purpose is privileged account bootstrap. It should not remain publicly executable. The new API branch no longer calls it; user provisioning uses Supabase Auth Admin from the server.

   The other functions perform internal role checks or support existing RLS policies, but their grants should be narrowed to the minimum required roles. Trigger-only functions should not be directly executable by API roles.

2. **Mutable search path.** `public.count_working_days` has no fixed `search_path`. It is not SECURITY DEFINER, but the advisor still recommends pinning its search path.

3. **Leaked-password protection disabled.** Supabase Auth's compromised-password protection is currently disabled. Enable and test it through the Supabase Auth security settings.

4. **Storage access helper.** `can_access_document_object(text)` returns true for a storage object name that has no matching `employee_documents` row after confirming the caller is staff. Review this fallback before any policy is ever attached to the actual `cit-lms-documents` bucket; unknown/unregistered object names should not be granted by default.

## Performance advisor findings

- The advisor reports 20 foreign-key columns without covering indexes, including uploader/captured-by IDs, employee foreign keys, and document relationship foreign keys.
- The advisor also reports an RLS initialization-plan warning for `profiles_update_self`.

These are existing production findings, not changes made by this branch. Index additions should be designed and reviewed separately; do not apply them automatically to production.

## Application security model

- Next.js calls the Express API for protected HR workflows.
- The API validates Supabase Auth access tokens and reloads role/active status from `public.profiles` on every authenticated request.
- The API's direct PostgreSQL connection is a trusted server-side connection; it may bypass RLS depending on the configured database role. API route authorization is therefore mandatory and RLS must not be described as the API's sole authorization boundary.
- The service-role key bypasses Storage RLS. All document upload, download, and deletion operations must go through API authorization.
- The browser must never receive `SUPABASE_SERVICE_ROLE_KEY` or unrestricted direct database credentials.

## Recommended production hardening plan — not executed

1. Review and revoke unnecessary `EXECUTE` grants, starting with `bootstrap_owner_profile` and trigger-only functions. Preserve only the grants required by RLS and trusted server workflows.
2. Pin `search_path` for `count_working_days`.
3. Review `can_access_document_object` and change its unknown-document fallback to deny before using Storage policies for the existing bucket.
4. Reconcile Storage policy bucket IDs with `cit-lms-documents`; keep the bucket private and use server-side signed URLs/proxying.
5. Enable leaked-password protection and test login/password-reset behavior.
6. Review the 20 missing foreign-key indexes and the RLS initialization-plan warning.
7. Re-run Supabase security and performance advisors after a separately approved hardening migration.

No SQL in this document has been applied. Production security changes require a separate reviewed migration and explicit approval.
