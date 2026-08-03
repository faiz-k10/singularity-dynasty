-- Adds two badge fields, computed by the Monte Carlo model, to all three
-- player-listing tables: a trend tag (recent form vs. the weighted
-- baseline) and a sample-confidence tag (whether the projection is fully
-- trusted on its own history, or blended toward a positional baseline
-- because the player's sample is thin). Both nullable, same "falls back
-- gracefully if a CSV doesn't include them yet" treatment as every other
-- field added this way.
alter table public.redraft_rankings
  add column trend text,
  add column sample_confidence text;

alter table public.best_ball_rankings
  add column trend text,
  add column sample_confidence text;

alter table public.player_simulations
  add column trend text,
  add column sample_confidence text;

comment on column public.redraft_rankings.trend is
  'RISING / FALLING / STEADY -- last-4-games average vs. the weighted median baseline, +/-10% band.';
comment on column public.redraft_rankings.sample_confidence is
  'established (full own-history trust) or building (blended with positional baseline, <20 career games).';
comment on column public.best_ball_rankings.trend is
  'RISING / FALLING / STEADY -- last-4-games average vs. the weighted median baseline, +/-10% band.';
comment on column public.best_ball_rankings.sample_confidence is
  'established (full own-history trust) or building (blended with positional baseline, <20 career games).';
comment on column public.player_simulations.trend is
  'RISING / FALLING / STEADY -- last-4-games average vs. the weighted median baseline, +/-10% band.';
comment on column public.player_simulations.sample_confidence is
  'established (full own-history trust) or building (blended with positional baseline, <20 career games).';
