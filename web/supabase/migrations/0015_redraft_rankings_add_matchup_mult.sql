-- Opponent-strength multiplier for this player's Week 1 matchup (fantasy
-- points allowed by that defense to this position, vs. league average,
-- shrunk toward 1.0 and capped to [0.80, 1.20] -- see
-- compute_matchup_multipliers() in projection_engine.R). Already baked
-- into `projection`; stored separately so the front end can show a
-- red/yellow/green matchup indicator without re-deriving it.
alter table public.redraft_rankings
  add column matchup_mult numeric;

comment on column public.redraft_rankings.matchup_mult is
  'Opponent-strength multiplier applied to this row''s projection (1.0 = neutral, >1 = favorable matchup, <1 = tough matchup). Range [0.80, 1.20].';
