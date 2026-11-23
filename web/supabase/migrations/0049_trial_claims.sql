-- The 14-day Explorer trial, one per Sleeper account (founder, Nov 22 2026: "make it so each sleeper username is recorded so a fresh email
-- cannot ... get the 14 day free trial"). Run once in the Supabase SQL editor; running it again is harmless.
--
-- 1. trial_claims: every Sleeper account (by Sleeper's permanent user id, which survives a username change) that has started a trial, and
--    the account that started it. The row outlives that account (user_id goes null), so deleting an account doesn't free the trial again.
--    Written only by the server (service role): RLS on, no policies.
create table if not exists public.trial_claims (
  sleeper_user_id text primary key,
  sleeper_username text,
  user_id uuid references auth.users (id) on delete set null,
  claimed_at timestamptz not null default now()
);
alter table public.trial_claims enable row level security;

-- 2. When this account's trial started (null = never had one), so a second trial can't start on the same account either, and the
--    Sleeper account it signed up with (required at sign-up).
alter table public.profiles add column if not exists trial_started_at timestamptz;
alter table public.profiles add column if not exists sleeper_user_id text;
alter table public.profiles add column if not exists sleeper_username text;

-- 3. The saved-team cap now counts the plan the member actually has: the higher of the paid tier and a bonus tier that hasn't run out
--    (a trial or a Night Sky reward, lib/subscriptionTier.js effectiveTier). Before this it read only `tier`, so a trial account was
--    refused a second league. Same limits as lib/tierLimits.js SAVED_TEAM_LIMITS: Stargazer 1, Explorer 10, Singularity unlimited.
create or replace function public.check_saved_team_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_bonus text;
  v_until timestamptz;
  v_limit int;
  v_other_count int;
begin
  select tier, bonus_tier, bonus_until into v_tier, v_bonus, v_until from public.profiles where id = new.user_id;
  v_tier := coalesce(v_tier, 'stargazer');
  if v_bonus is not null and v_until > now() then
    if v_bonus = 'singularity' or (v_bonus = 'explorer' and v_tier = 'stargazer') then
      v_tier := v_bonus;
    end if;
  end if;

  -- null limit = unlimited, skip the check entirely
  v_limit := case v_tier
    when 'explorer' then 10
    when 'singularity' then null::int
    else 1
  end;

  if v_limit is null then
    return new;
  end if;

  select count(*) into v_other_count
  from public.saved_teams
  where user_id = new.user_id
    and not (platform = new.platform
             and platform_league_id = new.platform_league_id);

  if v_other_count >= v_limit then
    raise exception
      'Saved-team limit reached for the % tier (limit %).',
      v_tier, v_limit
      using errcode = 'check_violation', hint = 'upgrade';
  end if;

  return new;
end;
$$;
