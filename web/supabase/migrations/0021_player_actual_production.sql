-- Real weekly actual fantasy production -- powers the regression-to-
-- projection score on Player Season Simulations (lib/regressionScore.js):
-- a player's currentPPG (mean of these rows for the season) compared
-- against their preseason projected PPG. Published by
-- web/scripts/publish-actual-production.mjs, derived from
-- player_game_log (already refreshed weekly from real nflreadr box
-- scores) rather than hand-entered -- run as part of the normal weekly
-- publish cycle right alongside the game log itself.
--
-- One row per player per week actually played -- NOT a running total.
-- A bye week or missed game simply has no row for that week rather than
-- a zero, so it doesn't drag currentPPG down for a game that never
-- happened.
create table public.player_actual_production (
  id uuid primary key default gen_random_uuid(),
  season integer not null default extract(year from now())::integer,
  week integer not null,
  player_name text not null,
  position text not null,
  actual_points numeric not null,
  created_at timestamptz not null default now()
);

alter table public.player_actual_production enable row level security;

create policy "Anyone can read actual production"
  on public.player_actual_production for select
  using (true);

create index player_actual_production_season_player_idx
  on public.player_actual_production (season, player_name);
