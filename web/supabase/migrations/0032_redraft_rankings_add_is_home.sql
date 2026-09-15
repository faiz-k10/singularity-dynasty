-- Home/away for this week's matchup -- powers the "vs"/"@" distinction
-- on the combined Team+Opponent column. load_opponents() in the model
-- always mapped a team straight to its opponent (home or away alike,
-- discarding which side of the matchup they're on), so this needed its
-- own column rather than being derivable from what's already published.
-- Nullable: rows published before this migration (and any row where the
-- schedule lookup failed) simply have no home/away distinction to show.
alter table public.redraft_rankings
  add column is_home boolean;
