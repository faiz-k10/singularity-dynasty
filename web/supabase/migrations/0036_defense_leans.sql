-- Strongest defense-vs-position trends, shown as small matchup flags (smash / tough spot) beside the
-- opponent in Weekly Projection Rankings. Display only: these are NOT inputs to any projection.
-- One row per defense per position per week, written by model/defense_impact.R and published by
-- scripts/publish-defense-leans.mjs; only cells scoring 2.0+ are stored, and the site flags tier 1.
--
--   week        the last completed week of games the numbers run through
--   call        SMASH (generous defense) or AVOID (stingy defense)
--   score/tier  how strong the lean is (see model/defense_impact.R): tier 1 = 3.0+, 2 = 2.5+, 3 = 2.0+
--   effect      opponent-adjusted fantasy points per game that defense allows to the position vs. an average defense
--   rank_now / rank_prior   1 = most generous, among 32 defenses, this season / last season
--
-- Run once in the Supabase SQL editor.
create table public.defense_leans (
  season integer not null,
  week integer not null,
  defense text not null,
  position text not null,
  call text not null,
  score numeric not null,
  tier integer not null,
  effect numeric,
  effect_sd numeric,
  games integer,
  lean_games integer,
  rank_now integer,
  rank_prior integer,
  ppg_now numeric,
  ppg_prior numeric,
  created_at timestamptz not null default now(),
  primary key (season, week, defense, position)
);

alter table public.defense_leans enable row level security;

create policy "Anyone can read defense leans"
  on public.defense_leans for select
  using (true);
