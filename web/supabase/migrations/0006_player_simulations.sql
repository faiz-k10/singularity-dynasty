-- Player season simulations: full-season Monte Carlo output distilled to
-- floor (10th percentile), median (50th), and ceiling (90th) points per
-- player. Published once per season and edited in place, so this just
-- shows whatever season has the most recent rows.
create table public.player_simulations (
  id uuid primary key default gen_random_uuid(),
  season integer not null default extract(year from now())::integer,
  player_name text not null,
  position text not null,
  team text,
  floor numeric not null,
  median numeric not null,
  ceiling numeric not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.player_simulations enable row level security;

create policy "Anyone can read player simulations"
  on public.player_simulations for select
  using (true);

create index player_simulations_season_median_idx
  on public.player_simulations (season, median desc);
