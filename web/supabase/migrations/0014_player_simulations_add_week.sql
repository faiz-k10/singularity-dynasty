-- Brings Player Season Simulations onto the same weekly-republish pattern
-- as Redraft and Best Ball: a `week` column so "latest" is picked via
-- order by season desc, week desc, and a fresh INSERT each week naturally
-- supersedes the prior one -- no more explicit DELETE-before-INSERT step.
-- The underlying numbers are still a season-total projection, not a
-- per-week stat; `week` here just marks which week's republish produced
-- this snapshot, same as the other two tools' `week` already does
-- double duty as a publish-batch marker.
alter table public.player_simulations
  add column week integer;

comment on column public.player_simulations.week is
  'NFL week (by real calendar date) this season-simulation snapshot was published for -- not a per-week stat, just the publish batch marker, matching redraft_rankings/best_ball_rankings.';
