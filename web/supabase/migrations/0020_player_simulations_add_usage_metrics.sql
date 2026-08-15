-- WOPR (Weighted Opportunity Rating) and EPA (Expected Points Added),
-- pulled from nflreadr's load_player_stats() and weighted the same way
-- scoring_stats already is (see model/usage_metrics.R). Display-only
-- additions next to POR on Player Season Simulations -- neither feeds the
-- Monte Carlo simulation, so this didn't need new backtesting the way a
-- change to the simulation inputs would. Both nullable, same
-- "falls back gracefully if a CSV doesn't include them yet" treatment as
-- every other field added this way. wopr is receiving-usage only, so QB
-- rows are expected to stay null.
alter table public.player_simulations
  add column wopr numeric,
  add column epa numeric;

comment on column public.player_simulations.wopr is
  'Weighted Opportunity Rating (1.5*target_share + 0.7*air_yards_share), weighted mean over recency-weighted game history, same MED_DECAY as scoring_stats. Null for QB (receiving usage only).';
comment on column public.player_simulations.epa is
  'Expected Points Added per game, weighted mean over recency-weighted game history: passing_epa (QB), rushing_epa+receiving_epa (RB), receiving_epa (WR/TE).';
