-- Adds the Week 1 opponent (from the real, already-released NFL schedule)
-- to Redraft Rankings. Nullable, same fallback treatment as every other
-- field added this way. Update by republishing with a later `week`
-- argument to load_week1_opponents() as the real season progresses --
-- this column isn't automatically tied to our internal publish-batch
-- "week" counter, which is a separate thing.
alter table public.redraft_rankings
  add column opponent text;

comment on column public.redraft_rankings.opponent is
  'Opponent team code for the NFL week this projection represents (currently Week 1 of the upcoming season).';
