-- Adds ffopportunity's expected PPR fantasy points (xFP) to the
-- per-player-week game log from 0027. One extra column: the modeled
-- points a player "should have" scored given his opportunity that game
-- (targets, air yards, carries, situation), from
-- nflreadr::load_ff_opportunity(stat_type = "weekly").total_fantasy_points_exp.
--
-- Same scoring basis as fantasy_points_ppr (1 PPR), so My Analysis can
-- plot points-over-expected straight off these two columns. NULL where
-- ffopportunity had no row for that player-week (~12% of games -- cameos
-- with no modeled opportunity); those drop out of the expected metrics
-- client-side. Populated by model/player_game_log.R, published via
-- web/scripts/publish-player-game-log.mjs (full refresh).

alter table public.player_game_log
  add column if not exists exp_points_ppr numeric;
