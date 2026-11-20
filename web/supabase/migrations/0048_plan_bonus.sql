-- Plan time won in the Night Sky (Nov 19 2026): a week of the next plan up (14,000 points) and, for free members, a month of
-- Explorer (30,000 points) are granted automatically as a time-limited bonus tier. The effective tier is the higher of `tier`
-- (set only by Stripe, lib/billing.js) and `bonus_tier` while `bonus_until` is in the future (lib/subscriptionTier.js effectiveTier).
-- Written only by the server with the service role; 0038 already stops members updating anything on profiles but email_digest.
-- Run once in the Supabase SQL editor.
alter table public.profiles
  add column if not exists bonus_tier text check (bonus_tier is null or bonus_tier in ('explorer', 'singularity')),
  add column if not exists bonus_until timestamptz;
