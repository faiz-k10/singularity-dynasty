# Constants shared by dynasty_production_value.R (the production number) and dynasty_value.R (the board's data + game logs).
WINDOW    <- 34   # games of memory; was 17 / half-life 8 until Oct 29 2026 -- backtest_production_window.R: a longer memory predicts
HALF_LIFE <- 17   # next season better (WR -2.1% RMSE, QB -1.4%, TE -0.3%, RB +0.4% vs 17 / 8); this is the CONTENDER's production number
# The REBUILDER's production number is shorter (founder, Nov 3 2026): his last 17 games, half-life 8 (the old setting, in the backtest grid)
WINDOW_SHORT    <- 17
HALF_LIFE_SHORT <- 8

# THROUGH (season x 100 + week): the newest game the board may use. The newest REGULAR-SEASON week whose games are ALL final, so a
# run between Thursday and Monday night can't half-count a week (founder, Nov 21 2026: a by-hand run with week 11 picked up only
# Thursday's game). DYN_THROUGH=<season x 100 + week> asks for an earlier week; asking for an unfinished one stops the run.
dyn_through <- function() {
  s <- as.data.frame(nflreadr::load_schedules(nflreadr::most_recent_season(roster = FALSE)))
  s <- s[s$game_type == "REG", ]
  done <- tapply(!is.na(s$result), s$week, all)
  fin <- suppressWarnings(max(as.integer(names(done)[done])))
  finished <- if (is.finite(fin)) max(s$season) * 100 + fin else (max(s$season) - 1) * 100 + 18 # before week 1: last season
  want <- suppressWarnings(as.integer(Sys.getenv("DYN_THROUGH", NA)))
  if (is.na(want)) return(finished)
  if (want > finished) stop(sprintf("DYN_THROUGH=%d: that week isn't finished yet (newest finished week: %d)", want, finished))
  want
}
