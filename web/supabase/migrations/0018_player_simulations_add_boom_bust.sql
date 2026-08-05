-- Boom/bust profile: share of simulated seasons landing 20%+ below
-- (bust) vs. 20%+ above (boom) THIS PLAYER'S OWN median, with the
-- remainder as "normal." Self-relative rather than a fixed point
-- threshold -- see projection_engine.R's boom/bust comment for why.
-- All three always sum to 100.
alter table public.player_simulations
  add column bust_pct numeric,
  add column normal_pct numeric,
  add column boom_pct numeric;

comment on column public.player_simulations.bust_pct is
  'Percent of simulated seasons landing 20%+ below this player''s own simulated median.';
comment on column public.player_simulations.normal_pct is
  'Percent of simulated seasons within 20% of this player''s own simulated median.';
comment on column public.player_simulations.boom_pct is
  'Percent of simulated seasons landing 20%+ above this player''s own simulated median.';
