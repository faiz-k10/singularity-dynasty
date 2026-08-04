-- Same opponent-strength multiplier as redraft_rankings (0015), for Best
-- Ball's This Week ceiling column.
alter table public.best_ball_rankings
  add column matchup_mult numeric;

comment on column public.best_ball_rankings.matchup_mult is
  'Opponent-strength multiplier applied to this row''s ceiling_score (1.0 = neutral, >1 = favorable matchup, <1 = tough matchup). Range [0.80, 1.20].';
