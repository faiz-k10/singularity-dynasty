-- Granular per-stat season projections (passing/rushing/receiving yards
-- & TDs, interceptions, receptions), each with its own floor/median/
-- ceiling -- position-dependent (see STAT_COLS_BY_POSITION in
-- projection_engine.R), so a WR's row simply omits passing_* keys rather
-- than carrying null columns. A single jsonb column instead of ~24 sparse
-- numeric columns most rows wouldn't use.
--
-- Shape: {"rushing_yards": {"floor": 1359, "median": 1596, "ceiling": 1854}, ...}
alter table public.player_simulations
  add column stat_ranges jsonb;

comment on column public.player_simulations.stat_ranges is
  'Per-stat season floor/median/ceiling (passing/rushing/receiving yards & TDs, interceptions, receptions), keyed by stat name -- position-dependent set of keys, see STAT_COLS_BY_POSITION in projection_engine.R.';
