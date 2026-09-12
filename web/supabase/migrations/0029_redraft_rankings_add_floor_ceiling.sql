-- Weekly floor/ceiling for Redraft Weekly Rankings -- distinct from
-- player_simulations' season-total floor/ceiling. projection_engine.R
-- already computes these per player per week (10th/96th calibrated
-- quantile of that player's own weighted history, matchup-adjusted same
-- as `projection`) -- they just weren't exported before. Nullable: this
-- week's already-published rows predate the export change and will read
-- null (rendered as "--" on the page) until the next weekly re-run.
alter table public.redraft_rankings
  add column floor numeric,
  add column ceiling numeric;

comment on column public.redraft_rankings.floor is
  'Weekly floor (10th percentile, calibrated FLOOR_Q), same matchup-adjustment as projection. Season-total floor lives on player_simulations instead.';
comment on column public.redraft_rankings.ceiling is
  'Weekly ceiling (96th percentile, calibrated CEIL_Q), same matchup-adjustment as projection. Season-total ceiling lives on player_simulations instead.';
