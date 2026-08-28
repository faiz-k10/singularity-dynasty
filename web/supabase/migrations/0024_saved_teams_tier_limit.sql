-- Per-tier cap on how many teams a user can save, matching the pricing
-- copy: Stargazer saves 1, Explorer and Singularity are unlimited.
--
-- Enforced in the database, not just the server action, because RLS
-- otherwise lets a signed-in user INSERT their own saved_teams rows
-- directly with their access token. BEFORE INSERT also fires on the
-- UPDATE leg of the saveTeam() upsert (re-saving to refresh a roster),
-- so the count deliberately EXCLUDES any row that already carries this
-- team's (platform, platform_league_id) key -- refreshing an existing
-- saved team is always allowed; only adding a NEW one is capped.

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
    when 'explorer' then null::int
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

-- create OR REPLACE (Postgres 14+) rather than drop+create, so re-running
-- this migration doesn't trip the SQL editor's "destructive operation"
-- guard on a DROP.
create or replace trigger enforce_saved_team_limit
  before insert on public.saved_teams
  for each row execute function public.check_saved_team_limit();
