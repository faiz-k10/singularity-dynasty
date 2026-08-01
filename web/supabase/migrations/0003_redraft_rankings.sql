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

-- Public read is safe here: the /tools/redraft-rankings page itself decides
-- server-side how many rows a given visitor's tier is allowed to see and
-- only ever fetches that many, so a free visitor's page never receives the
-- full paid dataset over the wire in the first place.
create policy "Anyone can read redraft rankings"
  on public.redraft_rankings for select
  using (true);

create index redraft_rankings_season_week_idx
  on public.redraft_rankings (season, week);
