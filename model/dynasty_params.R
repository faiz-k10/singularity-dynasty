# Constants shared by dynasty_production_value.R (the production number) and dynasty_value.R (the board's data + game logs).
WINDOW    <- 34   # games of memory; was 17 / half-life 8 until Oct 29 2026 -- backtest_production_window.R: a longer memory predicts
HALF_LIFE <- 17   # next season better (WR -2.1% RMSE, QB -1.4%, TE -0.3%, RB +0.4% vs 17 / 8); this is the CONTENDER's production number
# The REBUILDER's production number is shorter (founder, Nov 3 2026): his last 17 games, half-life 8 (the old setting, in the backtest grid)
WINDOW_SHORT    <- 17
HALF_LIFE_SHORT <- 8
