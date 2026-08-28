-- Optional per-team buy-in / stake amount, powering the /my-team
-- portfolio view's dollar-exposure-per-player numbers.
--
-- User-entered (not from Sleeper), so it's its own column rather than a
-- key in the settings jsonb: saveTeam() rewrites settings + players
-- wholesale on every roster refresh, and an upsert that omits buy_in
-- leaves an existing value untouched -- a settings key would be wiped.
alter table public.saved_teams
  add column if not exists buy_in numeric;
