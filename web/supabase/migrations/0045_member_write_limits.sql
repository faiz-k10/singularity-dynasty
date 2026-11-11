-- Pre-launch abuse check (Nov 11 2026). Signed-in members can write their OWN rows in these tables straight through the Supabase API with
-- their login token (row-level security only checks that the row is theirs), which skips the size and format checks the site's own save
-- action does. Without limits in the database, one account could store any amount of data (a 50MB "roster", or a loop inserting history
-- rows forever). These limits apply to NEW writes only (NOT VALID), so nothing already stored is touched.
-- Run once in the Supabase SQL editor.

-- 1. Size caps. A real saved team is ~16KB (settings ~8.5KB + players ~8.5KB); the site's save action refuses anything over 1.5MB.
alter table public.saved_teams
  add constraint saved_teams_size_limit check (pg_column_size(settings) + pg_column_size(players) < 2000000) not valid;
alter table public.team_snapshot_history
  add constraint team_snapshot_history_size_limit check (pg_column_size(settings) + pg_column_size(players) < 2000000) not valid;
alter table public.user_insights
  add constraint user_insights_size_limit check (pg_column_size(value) < 200000) not valid;
alter table public.team_insights
  add constraint team_insights_size_limit check (pg_column_size(value) < 200000) not valid;

-- 2. A Sleeper league id is digits (the save action already checks 6-24 digits).
alter table public.saved_teams
  add constraint saved_teams_league_id_digits check (platform_league_id ~ '^[0-9]{6,24}$') not valid;

-- 3. Snapshot history keeps the newest 60 snapshots per saved team (it is append-only, written on every save), so it can't grow without end.
create or replace function public.trim_team_snapshot_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.team_snapshot_history
  where saved_team_id = new.saved_team_id
    and id not in (
      select id from public.team_snapshot_history
      where saved_team_id = new.saved_team_id
      order by captured_at desc
      limit 60
    );
  return null;
end;
$$;

drop trigger if exists trim_team_snapshot_history on public.team_snapshot_history;
create trigger trim_team_snapshot_history
  after insert on public.team_snapshot_history
  for each row execute function public.trim_team_snapshot_history();
