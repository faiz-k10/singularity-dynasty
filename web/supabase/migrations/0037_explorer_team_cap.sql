-- Explorer now saves up to 10 teams (Stargazer 1, Singularity unlimited), matching lib/tierLimits.js
-- SAVED_TEAM_LIMITS -- keep the two in sync. Same trigger as 0024, only the Explorer branch changes:
-- create or replace, so running it again is harmless. Run once in the Supabase SQL editor.

create or replace function public.check_saved_team_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_limit int;
  v_other_count int;
begin
  select tier into v_tier from public.profiles where id = new.user_id;

  -- null limit = unlimited, skip the check entirely
  v_limit := case coalesce(v_tier, 'stargazer')
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
      coalesce(v_tier, 'stargazer'), v_limit
      using errcode = 'check_violation', hint = 'upgrade';
  end if;

  return new;
end;
$$;
