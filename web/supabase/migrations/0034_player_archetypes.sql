-- Player archetypes: each player's role group (e.g. "Lead Back", "Slot / YAC Receiver",
-- "Featured Receiving TE"), assigned weekly from the frozen groups in
-- model/archetype_model.R by model/player_archetypes.R, then published by
-- scripts/publish-player-archetypes.mjs. One row per player per (season, week), same
-- batching as player_simulations. RB, WR and TE only for now (QB is held back).
--
--   archetype   the player's group
--   runner_up   the next-closest group (for players near a boundary)
--   confidence  0 = on the boundary with the runner-up, 1 = deep inside his own group
--
-- Run once in the Supabase SQL editor.
create table public.player_archetypes (
  season integer not null,
  week integer not null,
  player_name text not null,
  position text not null,
  archetype text not null,
  runner_up text,
  confidence numeric,
  created_at timestamptz not null default now(),
  primary key (season, week, player_name)
);

alter table public.player_archetypes enable row level security;

create policy "Anyone can read player archetypes"
  on public.player_archetypes for select
  using (true);

create index player_archetypes_season_week_idx
  on public.player_archetypes (season, week, position);
