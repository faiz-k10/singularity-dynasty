-- 1) Weekly email opt-in ("Your Players This Week", Explorer and up). Off until the member turns it on.
-- 2) Lock the billing columns. 0001 gave every signed-in user an UPDATE policy on their own profile row with no column
--    limit, so any signed-in user could have set their own `tier` (or the Stripe ids) straight through the API and skipped
--    every paywall. Column privileges fix that: the signed-in role may now update ONLY email_digest. The Stripe webhook
--    and the scripts use the service role, which is unaffected.
-- Run once in the Supabase SQL editor.

alter table public.profiles add column if not exists email_digest boolean not null default false;

revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;
grant update (email_digest) on public.profiles to authenticated;
