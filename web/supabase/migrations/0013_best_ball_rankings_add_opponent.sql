-- Same Week 1 opponent field added to Redraft Rankings (0012), now for
-- Best Ball too. Nullable, same fallback treatment as every other field
-- added this way.
alter table public.best_ball_rankings
  add column opponent text;

comment on column public.best_ball_rankings.opponent is
  'Opponent team code for the NFL week this projection represents (currently Week 1 of the upcoming season).';
