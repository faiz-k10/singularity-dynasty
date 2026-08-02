-- Adds a projected-points number to redraft rankings. Nullable — existing
-- publishing workflow keeps working if a CSV doesn't include it yet.
alter table public.redraft_rankings
  add column projection numeric;
