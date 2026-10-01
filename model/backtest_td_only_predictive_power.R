# Standalone check: how predictive is a TD-points-only model on its own
# terms, independent of whether combining it with a non-TD component
# helps the overall median (backtest_td_split_weekly.R already answered
# that -- no). This isolates the TD component itself: does it beat naive
# baselines, and how much does it actually explain?
#
# Run: Rscript backtest_td_only_predictive_power.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 6
TD_DECAY <- c(RB = 0.72, WR = 0.84, TE = 0.93)  # best found in backtest_td_split_weekly.R

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_mean_w <- function(x, w) sum(x * w) / sum(w)

all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
stats <- raw[raw$season_type == "REG",
             c("player_id", "position", "season", "week", "rushing_tds", "receiving_tds")]
stats <- stats[stats$position %in% c("RB", "WR", "TE"), ]
stats <- stats[!(stats$week %in% EXCLUDE_WEEKS), ]
stats$rushing_tds[is.na(stats$rushing_tds)] <- 0
stats$receiving_tds[is.na(stats$receiving_tds)] <- 0
stats$td_pts <- 6 * ifelse(stats$position == "RB", stats$rushing_tds + stats$receiving_tds, stats$receiving_tds)
stats <- stats[order(stats$player_id, stats$season, stats$week), ]

build_eval_points <- function(dataset, min_hist) {
  pts <- list(); i <- 0
  for (pid in unique(dataset$player_id)) {
    d <- dataset[dataset$player_id == pid, ]
    n <- nrow(d)
    if (n < min_hist + 1) next
    for (k in (min_hist + 1):n) {
      if (!(d$season[k] %in% TEST_SEASONS)) next
      i <- i + 1
      pts[[i]] <- list(hist = d$td_pts[1:(k - 1)], actual = d$td_pts[k])
    }
  }
  pts
}

for (pos in c("RB", "WR", "TE")) {
  dpos <- stats[stats$position == pos, ]
  pts <- build_eval_points(dpos, MIN_HIST_GAMES)
  actual <- sapply(pts, function(e) e$actual)

  pred_model <- sapply(pts, function(e) {
    w <- recency_weights(length(e$hist), TD_DECAY[pos])
    weighted_mean_w(e$hist, w)
  })
  pred_naive_own <- sapply(pts, function(e) mean(e$hist))  # unweighted own-history average
  league_avg <- mean(dpos$td_pts)
  pred_league <- rep(league_avg, length(pts))

  mae_model <- mean(abs(actual - pred_model))
  mae_naive <- mean(abs(actual - pred_naive_own))
  mae_league <- mean(abs(actual - pred_league))
  r <- cor(pred_model, actual)

  # Discrimination check: split into terciles by predicted td_pts, compare
  # real TD RATE (fraction of games with actual > 0) across terciles.
  terc <- cut(pred_model, quantile(pred_model, c(0, 1/3, 2/3, 1)), include.lowest = TRUE, labels = c("low","mid","high"))
  rate_by_terc <- tapply(actual > 0, terc, mean)

  cat("===", pos, "=== n=", length(pts), "===\n")
  cat(sprintf("  MAE  -- decayed model: %.3f | naive own-history avg: %.3f | league avg: %.3f\n", mae_model, mae_naive, mae_league))
  cat(sprintf("  Correlation (predicted vs actual): r=%.3f  (r^2=%.3f)\n", r, r^2))
  cat(sprintf("  Real TD-scoring rate by predicted tercile -- low=%.1f%%  mid=%.1f%%  high=%.1f%%\n\n",
              100*rate_by_terc["low"], 100*rate_by_terc["mid"], 100*rate_by_terc["high"]))
}
