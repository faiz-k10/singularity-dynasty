-- Raw weekly per-stat production (receptions, rushing/receiving yards &
-- TDs, passing yards/TDs/INTs -- position-dependent, see
-- STAT_COLS_BY_POSITION in projection_engine.R), keyed by stat name.
-- Powers the custom scoring settings panel on Redraft Rankings: the
-- frontend recomputes each player's projection from these components
-- under the visitor's own PPR / TE-premium / passing-TD / INT choices,
-- instead of being stuck with the single fixed-scoring `projection`
-- column. Values are weighted MEANS (not medians -- see weighted_mean()'s
-- comment in projection_engine.R), already shrinkage- and matchup-mult-
-- adjusted the same way `projection` is.
--
-- Shape: {"rushing_yards": 65.4, "rushing_tds": 0.73, "receptions": 4.81, ...}
alter table public.redraft_rankings
  add column scoring_stats jsonb;

comment on column public.redraft_rankings.scoring_stats is
  'Raw weekly per-stat production (weighted mean, shrinkage- and matchup-adjusted), keyed by stat name -- position-dependent set of keys, see STAT_COLS_BY_POSITION in projection_engine.R. Powers the custom scoring settings panel.';
