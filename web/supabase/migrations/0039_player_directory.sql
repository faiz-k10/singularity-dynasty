-- Our own NFL player directory (names, positions, teams, bios, headshots, and each player's Sleeper id), published from
-- nflverse data by model/player_directory.R + scripts/publish-player-directory.mjs. It replaces the site's reads of Sleeper's
-- 16MB player dictionary and Sleeper's headshot server, so the only thing the site still needs from Sleeper is each user's
-- own leagues. One row per player, keyed by the Sleeper id (the key My Team's rosters use).
--
-- Run once in the Supabase SQL editor.
create table public.player_directory (
  sleeper_id text primary key,
  gsis_id text,
  first_name text,
  last_name text,
  position text,
  team text,
  number integer,
  height text,
  weight integer,
  age numeric,
  birth_date date,
  years_exp integer,
  college text,
  status text,
  headshot_url text,
  updated_at timestamptz not null default now()
);

create index player_directory_gsis_idx on public.player_directory (gsis_id);

alter table public.player_directory enable row level security;

create policy "Anyone can read the player directory"
  on public.player_directory for select
  using (true);
