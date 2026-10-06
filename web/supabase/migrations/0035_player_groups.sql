-- Extra player groupings beyond role archetypes (player_archetypes, 0034): one row per player per
-- (season, week, kind), assigned weekly by model/player_groups.R and published by
-- scripts/publish-player-groups.mjs. A generic shape on purpose, so a new kind of grouping needs
-- no new table.
--
--   kind    'sustainability' (Running Hot / In Line / Running Cold) or 'career_stage'
--           (Ascending / Prime / Decline Watch / Late Career; QB: Ascending / Prime / Veteran)
--   label   the group
--   detail  the numbers behind it (sustainability: games, fp_pg, xfp_pg, gap_pg, z;
--           career_stage: age, years_exp)
--
-- Run once in the Supabase SQL editor.
create table public.player_groups (
  season integer not null,
  week integer not null,
  player_name text not null,
  position text not null,
  kind text not null,
  label text not null,
  detail jsonb,
  created_at timestamptz not null default now(),
  primary key (season, week, player_name, kind)
);

alter table public.player_groups enable row level security;

create policy "Anyone can read player groups"
  on public.player_groups for select
  using (true);

create index player_groups_season_week_kind_idx
  on public.player_groups (season, week, kind);
