# Constants shared by dynasty_production_value.R (the production number) and dynasty_value.R (the board's data + game logs).
WINDOW    <- 34   # games of memory; was 17 / half-life 8 until Oct 29 2026 -- backtest_production_window.R: a longer memory predicts
HALF_LIFE <- 17   # next season better (WR -2.1% RMSE, QB -1.4%, TE -0.3%, RB +0.4% vs 17 / 8); one setting for every position
