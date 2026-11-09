-- Lock the paid model tables to the server (security pass, Nov 9 2026).
--
-- Until now these tables had an "anyone can read" policy, so anyone holding the project's public (anon) key could download every
-- row -- the full season simulations (a Singularity feature) and every weekly ranking (Explorer) -- straight from the database,
-- skipping the tier gates the site applies on its own pages. The key is not on any page today, but Supabase treats it as public.
--
-- The site reads these tables only on the server, through lib/supabase/public.js, which uses the service-role key (it bypasses
-- RLS), so dropping the policies changes nothing on the site. The publishing scripts also use the service-role key.
-- Deploy the code that uses the service-role key FIRST (it is live once this file is on main), then run this.
--
-- Left public on purpose: posts, prospect_rankings (a free feature), player_game_log / player_actual_production (nflverse box
-- scores), defense_leans and player_directory (names, teams, bios).

drop policy if exists "Anyone can read redraft rankings" on public.redraft_rankings;
drop policy if exists "Anyone can read player simulations" on public.player_simulations;
drop policy if exists "Anyone can read the draft board" on public.draft_board;
drop policy if exists "Anyone can read player groups" on public.player_groups;
drop policy if exists "Anyone can read player archetypes" on public.player_archetypes;
drop policy if exists "Anyone can read best ball rankings" on public.best_ball_rankings;

-- RLS stays enabled on each, so with no policy the anon and authenticated roles read nothing.
