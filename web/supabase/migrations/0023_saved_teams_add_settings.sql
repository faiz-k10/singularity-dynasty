-- League format at save time (teams, QB format, scoring, TE premium) --
-- shown as labels next to the team name/league in the UI. Pulled straight
-- from Sleeper's own league object (roster_positions, scoring_settings),
-- no extra API call needed.
alter table public.saved_teams
  add column settings jsonb not null default '{}'::jsonb;
