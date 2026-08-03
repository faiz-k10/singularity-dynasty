-- Adds the two Monte Carlo model outputs to best ball rankings, matching
-- the treatment redraft_rankings already got in 0008. Both nullable —
-- existing publishing workflow keeps working if a CSV doesn't include them
-- yet, and the page renders "—" for missing values same as projection does
-- on redraft.
alter table public.best_ball_rankings
  add column ceiling_score numeric,
  add column playoff_ceiling_score numeric;

comment on column public.best_ball_rankings.ceiling_score is
  'This week''s ceiling-weighted projection (90th-ish percentile, model-calibrated per position).';
comment on column public.best_ball_rankings.playoff_ceiling_score is
  'Combined ceiling projection for the fantasy playoff window (weeks 15-17), recomputed weekly as the season''s data updates.';
