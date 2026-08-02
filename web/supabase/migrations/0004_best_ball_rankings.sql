-- Best ball rankings: ceiling-weighted, published periodically through the
-- season (not tied to a specific NFL game week the way redraft rankings
-- are, but reuses the same season+week "batch" idea so republishing a
-- refreshed list works identically — bump the week number to publish a
-- new batch without needing to delete the old one).
create table public.best_ball_rankings (
  id uuid primary key default gen_random_uuid(),
  season integer not null default extract(year from now())::integer,
  week integer not null,
  rank integer not null,
  player_name text not null,
  position text not null,
  team text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.best_ball_rankings enable row level security;

create policy "Anyone can read best ball rankings"
  on public.best_ball_rankings for select
  using (true);

create index best_ball_rankings_season_week_idx
  on public.best_ball_rankings (season, week);
