-- Real weekly redraft rankings data, published by hand via the Supabase
-- Table Editor (or its CSV import) — one row per player per week.
create table public.redraft_rankings (
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

alter table public.redraft_rankings enable row level security;

-- Free for everyone (Stargazer tier and up) per the pricing copy — the
-- /tools/redraft-rankings page applies no tier gating at all.
create policy "Anyone can read redraft rankings"
  on public.redraft_rankings for select
  using (true);

create index redraft_rankings_season_week_idx
  on public.redraft_rankings (season, week);
