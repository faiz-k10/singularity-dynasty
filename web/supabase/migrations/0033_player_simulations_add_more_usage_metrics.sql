-- RYOE (Rush Yards Over Expected per attempt, RB/QB), Scramble Rate and
-- Play-Action Rate (QB only) -- same "computed and stored, doesn't feed
-- the Monte Carlo simulation" treatment as wopr/epa (migration 0020).
-- Added by explicit request as isolated display-only context, not
-- projection inputs. Populated by model/projection_engine.R, published
-- via scripts/publish-player-simulations.mjs.
alter table public.player_simulations
  add column ryoe numeric,
  add column scramble_rate numeric,
  add column play_action_rate numeric;

comment on column public.player_simulations.ryoe is
  'Rush Yards Over Expected per attempt (Next Gen Stats rushing), weighted mean over recency-weighted game history. RB and QB only, null for WR/TE.';
comment on column public.player_simulations.scramble_rate is
  'Share of QB dropbacks that were a scramble (0-100, percentage points), weighted mean over recency-weighted game history, from play-by-play. QB only.';
comment on column public.player_simulations.play_action_rate is
  'Share of QB dropbacks run from play-action (0-100, percentage points), weighted mean over recency-weighted game history, from play-by-play. QB only.';
