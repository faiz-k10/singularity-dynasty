-- Referral reward + email list (Nov 2 2026). Both written only by the server with the service role (lib/referrals.js,
-- app/api/subscribe); RLS is on with no policies, so no visitor can read or change them -- a member sees their own referral
-- numbers through the account page, which the server builds.
-- Run once in the Supabase SQL editor.

-- Each member's personal referral code (the ?ref= in their link). Made on first visit to the account page.
alter table public.profiles add column if not exists referral_code text;
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code) where referral_code is not null;

-- One row per referred account: who brought them, and how far it got. referred_id is unique, so an account can only ever
-- be credited to one referrer, and the reward (status 'rewarded') can only be paid once.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users (id) on delete cascade,
  referred_id uuid not null unique references auth.users (id) on delete cascade,
  status text not null default 'joined' check (status in ('joined', 'rewarded')),
  reward_cents integer,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (referrer_id <> referred_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, status);
alter table public.referrals enable row level security;

-- The newsletter list from the home page (and anywhere else that asks). One row per address; unsubscribing keeps the row
-- (with unsubscribed_at) so the address is never re-added by mistake. `token` is the secret in the unsubscribe link.
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,
  token text not null unique,
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);
alter table public.subscribers enable row level security;
