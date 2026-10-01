# Extends backtest_td_only_predictive_power.R: that model used ONE
# feature (a player's own past TD points, recency-weighted -- pure
# autoregression on touchdowns themselves). This builds a two-factor
# OPPORTUNITY model instead:
#
#   predicted TDs = predicted opportunities (carries or targets, own
#                   recency-weighted history) x predicted TD RATE
#                   (TDs per opportunity, own recency-weighted history,
#                   computed only over games with a nonzero opportunity
#                   count)
#
# Modeled per CHANNEL, not per td_pts total -- rushing TDs scale with
# carries, receiving TDs scale with targets, and RB is the one position
# that carries both channels (summed back together for a total, same
# definition of "td_pts" the prior backtest used, so the two are directly
# comparable). Each channel gets its own coordinate-descent decay sweep
# for the opportunity forecast and the rate forecast independently --
# usage volume and per-touch scoring rate are different kinds of signal
# and there's no reason to assume they want the same decay.
#
# Scored the identical way as backtest_td_only_predictive_power.R (MAE in
# TD-points units, correlation, tercile discrimination) so the two are a
# direct head-to-head: does opportunity x rate beat pure TD-points
# autoregression?
#
# Run: Rscript backtest_td_opportunity_model.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 6
DECAY_GRID <- seq(0.60, 0.97, by = 0.03)

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_mean_w <- function(x, w) sum(x * w) / sum(w)

all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
stats <- raw[raw$season_type == "REG",
             c("player_id", "position", "season", "week",
               "rushing_tds", "carries", "receiving_tds", "targets")]
stats <- stats[stats$position %in% c("RB", "WR", "TE"), ]
stats <- stats[!(stats$week %in% EXCLUDE_WEEKS), ]
for (col in c("rushing_tds", "carries", "receiving_tds", "targets")) stats[[col]][is.na(stats[[col]])] <- 0
stats <- stats[order(stats$player_id, stats$season, stats$week), ]

build_eval_points <- function(dataset, min_hist, td_col, opp_col) {
  pts <- list(); i <- 0
  for (pid in unique(dataset$player_id)) {
    d <- dataset[dataset$player_id == pid, ]
    n <- nrow(d)
    if (n < min_hist + 1) next
    for (k in (min_hist + 1):n) {
      if (!(d$season[k] %in% TEST_SEASONS)) next
      i <- i + 1
      pts[[i]] <- list(td_hist = d[[td_col]][1:(k - 1)], opp_hist = d[[opp_col]][1:(k - 1)],
                        actual_td = d[[td_col]][k])
    }
  }
  pts
}

score_channel <- function(pts, opp_decay, rate_decay) {
  sapply(pts, function(e) {
    n <- length(e$opp_hist)
    w_opp <- recency_weights(n, opp_decay)
    pred_opp <- weighted_mean_w(e$opp_hist, w_opp)

    has_opp <- e$opp_hist > 0
    if (sum(has_opp) == 0) return(0)
    rate_hist <- e$td_hist[has_opp] / e$opp_hist[has_opp]
    w_rate_full <- recency_weights(n, rate_decay)
    w_rate <- w_rate_full[has_opp]
    pred_rate <- weighted_mean_w(rate_hist, w_rate)

    pred_opp * pred_rate
  })
}

fit_channel <- function(pos, td_col, opp_col) {
  dpos <- stats[stats$position == pos, ]
  pts <- build_eval_points(dpos, MIN_HIST_GAMES, td_col, opp_col)
  actual <- sapply(pts, function(e) e$actual_td)

  stage1 <- sapply(DECAY_GRID, function(dc) mean(abs(actual - score_channel(pts, dc, 0.85))))
  best_opp <- DECAY_GRID[which.min(stage1)]
  stage2 <- sapply(DECAY_GRID, function(dc) mean(abs(actual - score_channel(pts, best_opp, dc))))
  best_rate <- DECAY_GRID[which.min(stage2)]

  pred <- score_channel(pts, best_opp, best_rate)
  list(pts = pts, actual = actual, pred = pred, best_opp = best_opp, best_rate = best_rate,
       mae_td_count = mean(abs(actual - pred)))
}

cat("=== Fitting opportunity-model channels ===\n")
rb_rush <- fit_channel("RB", "rushing_tds", "carries")
cat("RB rushing: opp_decay=", rb_rush$best_opp, " rate_decay=", rb_rush$best_rate,
    " MAE(TD count)=", round(rb_rush$mae_td_count, 3), "\n")
rb_rec <- fit_channel("RB", "receiving_tds", "targets")
cat("RB receiving: opp_decay=", rb_rec$best_opp, " rate_decay=", rb_rec$best_rate,
    " MAE(TD count)=", round(rb_rec$mae_td_count, 3), "\n")
wr_rec <- fit_channel("WR", "receiving_tds", "targets")
cat("WR receiving: opp_decay=", wr_rec$best_opp, " rate_decay=", wr_rec$best_rate,
    " MAE(TD count)=", round(wr_rec$mae_td_count, 3), "\n")
te_rec <- fit_channel("TE", "receiving_tds", "targets")
cat("TE receiving: opp_decay=", te_rec$best_opp, " rate_decay=", te_rec$best_rate,
    " MAE(TD count)=", round(te_rec$mae_td_count, 3), "\n\n")

# ---- RB total (rushing + receiving TDs, matching prior backtest's td_pts def) ----
cat("=== RB combined (rushing + receiving), points units (x6) ===\n")
dpos <- stats[stats$position == "RB", ]
pts_rush <- build_eval_points(dpos, MIN_HIST_GAMES, "rushing_tds", "carries")
pts_rec <- build_eval_points(dpos, MIN_HIST_GAMES, "receiving_tds", "targets")
# Same player/game order by construction (same dataset, same loop) -- pair by index.
pred_rb_total <- 6 * (score_channel(pts_rush, rb_rush$best_opp, rb_rush$best_rate) +
                       score_channel(pts_rec, rb_rec$best_opp, rb_rec$best_rate))
actual_rb_total <- 6 * (sapply(pts_rush, function(e) e$actual_td) + sapply(pts_rec, function(e) e$actual_td))
mae_rb <- mean(abs(actual_rb_total - pred_rb_total))
r_rb <- cor(pred_rb_total, actual_rb_total)
terc_rb <- cut(pred_rb_total, quantile(pred_rb_total, c(0, 1/3, 2/3, 1)), include.lowest = TRUE, labels = c("low","mid","high"))
rate_rb <- tapply(actual_rb_total > 0, terc_rb, mean)
cat(sprintf("  n=%d  MAE=%.3f  r=%.3f (r^2=%.3f)  TD-rate by tercile: low=%.1f%% mid=%.1f%% high=%.1f%%\n\n",
            length(pred_rb_total), mae_rb, r_rb, r_rb^2, 100*rate_rb["low"], 100*rate_rb["mid"], 100*rate_rb["high"]))

report_single <- function(name, chan) {
  pred_pts <- 6 * chan$pred
  actual_pts <- 6 * chan$actual
  mae <- mean(abs(actual_pts - pred_pts))
  r <- cor(pred_pts, actual_pts)
  terc <- cut(pred_pts, quantile(pred_pts, c(0, 1/3, 2/3, 1)), include.lowest = TRUE, labels = c("low","mid","high"))
  rate <- tapply(actual_pts > 0, terc, mean)
  cat(sprintf("%s  n=%d  MAE=%.3f  r=%.3f (r^2=%.3f)  TD-rate by tercile: low=%.1f%% mid=%.1f%% high=%.1f%%\n",
              name, length(pred_pts), mae, r, r^2, 100*rate["low"], 100*rate["mid"], 100*rate["high"]))
}
cat("=== WR / TE (receiving only) ===\n")
report_single("WR", wr_rec)
report_single("TE", te_rec)

cat("\n=== HEAD-TO-HEAD vs. pure TD-points autoregression (previous backtest) ===\n")
cat("Pos  OpportunityModel_MAE   PureTDHistory_MAE (from last run)\n")
cat(sprintf("RB   %.3f                   2.358\n", mae_rb))
cat(sprintf("WR   %.3f                   1.845\n", mean(abs(6*wr_rec$actual - 6*wr_rec$pred))))
cat(sprintf("TE   %.3f                   1.608\n", mean(abs(6*te_rec$actual - 6*te_rec$pred))))
