# CIT-LMS production go-live (Supabase + Next.js)

## 1. Apply database (required once)

SQL Editor → run the three numbered migrations in order under `supabase/migrations/`,
or the combined `APPLY_ALL_PRODUCTION.sql` if present.

## 2. Auth settings

- Authentication → Providers → Email enabled
- Disable public sign-ups
- Site URL = production frontend URL
- Redirect URLs include `https://<frontend>/login`

## 3. Create Company Owner

1. Authentication → Users → Add user (email + strong password)
2. Copy the user UUID
3. SQL Editor:

```sql
select public.bootstrap_owner_profile(
  '<user-uuid>'::uuid,
  'owner@your-domain',
  'Owner Full Name'
);
```

## 4. Frontend env

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key only>
```

Never put the secret key in frontend env or git.

## 5. Deploy

Root: `apps/web`. Build: `npm install && npm run build`. Start: `npm start`.
Or Vercel with Root Directory = `apps/web`.

## 6. Smoke checklist

- Login / logout
- Home session + counts
- Create synthetic employee
- Capture leave
- Admin cannot access disciplinary; HR can

## 7. Key hygiene

If secret keys were shared in chat, rotate them in Project Settings → API.

## 8. Express API

Not required when using the Supabase `lib/api.ts` adapter on this branch.
