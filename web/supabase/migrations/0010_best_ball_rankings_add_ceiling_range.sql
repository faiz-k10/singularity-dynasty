-- Adds a ceiling range + hit-probability alongside the existing single-point
-- ceiling_score, so the "This Week" column can show e.g. "38.4-44.3 · 14%"
-- instead of a bare number. Both nullable, matching the treatment
-- ceiling_score/playoff_ceiling_score got in 0009 — the page falls back to
-- rendering just ceiling_score if a CSV doesn't include these yet.
alter table public.best_ball_rankings
  add column ceiling_range_low numeric,
  add column ceiling_probability numeric;

comment on column public.best_ball_rankings.ceiling_range_low is
  'Lower bound of the ceiling range for this week (a lower weighted quantile than ceiling_score, same model).';
comment on column public.best_ball_rankings.ceiling_probability is
  'Whole-number percent chance (0-100) of clearing ceiling_range_low in a given week, from the player''s own weighted game log.';
