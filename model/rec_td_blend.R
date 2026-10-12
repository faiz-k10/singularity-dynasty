# Weekly receiving-TD figure for WRs and TEs (the "Rec TD" column / the custom-scoring component).
#
# Was: a recency-weighted mean of actual receiving TDs with a fast decay (0.69 WR / 0.60 TE), which is dominated by the
# last two or three games. A touchdown count is mostly luck game to game -- a player's TDs in one game barely predict the
# next once his role is accounted for (correlation ~0.01) -- so that method chased noise.
#
# Now: 75% expected receiving TDs (ffopportunity: how likely each target was to score given where it happened; decay
# 0.917 = half-life 8 games) + 25% actual receiving TDs on a slow decay (0.92), over the last 30 games.
# Backtest (22,000 WR/TE next-game outcomes, 2018-2025, RMSE vs actual next-game receiving TDs):
#   WR 0.5123 -> 0.4796 (-6.4%)   TE 0.4769 -> 0.4356 (-8.7%)   better in every one of 2022-2025.
# The earlier td-decay backtest (backtest_td_predictor.R) scored with mean ABSOLUTE error, which on a mostly-zero count
# rewards predicting near zero rather than a good mean; this column is a mean (it feeds custom scoring), so squared
# error is the right yardstick. Display / custom scoring only: the headline median projection is computed separately.
#
# Falls back to NA (caller keeps the old method) when the expected-TD data isn't loadable or the player has too few
# games with it.
REC_TD_WINDOW         <- 30
REC_TD_EXP_DECAY      <- 0.917
REC_TD_ACTUAL_DECAY   <- 0.92
REC_TD_EXP_SHARE      <- 0.75
REC_TD_MIN_EXP_GAMES  <- 6

# d    : one player's chronological game history (player_id, season, week, receiving_tds)
# hist : data frame of ffopportunity weekly rows (player_id, season, week, rec_touchdown_exp)
blended_rec_td <- function(d, hist) {
  if (is.null(hist) || nrow(d) == 0) return(NA_real_)
  dw <- d[tail(seq_len(nrow(d)), REC_TD_WINDOW), , drop = FALSE]
  h <- hist[hist$player_id == dw$player_id[1], , drop = FALSE]
  ex <- h$rec_touchdown_exp[match(paste(dw$season, dw$week), paste(h$season, h$week))]
  ok <- !is.na(ex)
  if (sum(ok) < REC_TD_MIN_EXP_GAMES) return(NA_real_)
  m <- length(ex)
  w_e <- REC_TD_EXP_DECAY^((m - 1):0)
  w_a <- REC_TD_ACTUAL_DECAY^((m - 1):0)
  xtd <- sum(w_e[ok] * ex[ok]) / sum(w_e[ok])
  act <- sum(w_a * dw$receiving_tds) / sum(w_a)
  REC_TD_EXP_SHARE * xtd + (1 - REC_TD_EXP_SHARE) * act
}
