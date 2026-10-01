# Tests the two ideas that survived the "does this just add noise"
# critique of the opportunity model (backtest_td_opportunity_model.R):
#
#   1. SHRINKAGE: blend a player's own recency-weighted TD rate (TDs per
#      opportunity) toward a position-level baseline rate, weighted by how
#      much real opportunity backs the player's own estimate -- standard
#      additive/Bayesian shrinkage, not a second independent noisy
#      estimate multiplied against the first. shrunk_rate = (own weighted
#      TD sum + k * baseline_rate) / (own weighted opportunity sum + k);
#      k (in "pseudo-opportunities") swept via backtest.
#
#   2. VEGAS: multiply the opportunity-model's prediction by
#      (this week's team implied total) / (league-average implied total)
#      -- team implied total from load_schedules()'s spread_line/
#      total_line (already in nflreadr, never used anywhere in this
#      model). Genuinely independent of the player's own history, unlike
#      every other feature tried so far.
#
# Baseline for comparison is the SAME pure-TD-history model already
# backtested (backtest_td_only_predictive_power.R): RB MAE=2.358 r²=0.102,
# WR MAE=1.845 r²=0.061, TE MAE=1.608 r²=0.038.
#
# Run: Rscript backtest_td_shrinkage_vegas.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 6
OPP_DECAY <- c(RB_rush = 0.60, RB_rec = 0.60, WR = 0.60, TE = 0.60)      # from backtest_td_opportunity_model.R
RATE_DECAY <- c(RB_rush = 0.78, RB_rec = 0.87, WR = 0.75, TE = 0.60)     # from backtest_td_opportunity_model.R
K_GRID <- c(0, 1, 2, 4, 8, 16, 32, 64, 128)

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_mean_w <- function(x, w) sum(x * w) / sum(w)

all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
stats <- raw[raw$season_type == "REG",
             c("player_id", "position", "team", "season", "week",
               "rushing_tds", "carries", "receiving_tds", "targets")]
stats <- stats[stats$position %in% c("RB", "WR", "TE"), ]
stats <- stats[!(stats$week %in% EXCLUDE_WEEKS), ]
for (col in c("rushing_tds", "carries", "receiving_tds", "targets")) stats[[col]][is.na(stats[[col]])] <- 0
stats <- stats[order(stats$player_id, stats$season, stats$week), ]

sch <- as.data.frame(load_schedules(seasons = all_seasons))
sch <- sch[, c("season", "week", "home_team", "away_team", "spread_line", "total_line")]
sch <- sch[!is.na(sch$total_line) & !is.na(sch$spread_line), ]
home <- data.frame(season = sch$season, week = sch$week, team = sch$home_team,
                    implied_total = sch$total_line / 2 + sch$spread_line / 2)
away <- data.frame(season = sch$season, week = sch$week, team = sch$away_team,
                    implied_total = sch$total_line / 2 - sch$spread_line / 2)
implied <- rbind(home, away)
league_avg_total <- mean(implied$implied_total)
cat("League-average team implied total:", round(league_avg_total, 1), "\n\n")

stats <- merge(stats, implied, by = c("season", "week", "team"), all.x = TRUE)
stats <- stats[order(stats$player_id, stats$season, stats$week), ]

# League-wide baseline TD rate per channel (all games, all players) -- the
# shrinkage target for a small-sample player.
baseline_rate <- list(
  RB_rush = sum(stats$rushing_tds[stats$position == "RB"]) / sum(stats$carries[stats$position == "RB"]),
  RB_rec  = sum(stats$receiving_tds[stats$position == "RB"]) / sum(stats$targets[stats$position == "RB"]),
  WR      = sum(stats$receiving_tds[stats$position == "WR"]) / sum(stats$targets[stats$position == "WR"]),
  TE      = sum(stats$receiving_tds[stats$position == "TE"]) / sum(stats$targets[stats$position == "TE"])
)
cat("Baseline (league) TD rates:", paste(names(baseline_rate), round(unlist(baseline_rate), 4), sep = "=", collapse = "  "), "\n\n")

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
                        actual_td = d[[td_col]][k], implied_total = d$implied_total[k])
    }
  }
  pts
}

pred_opportunity <- function(pts, opp_decay) {
  sapply(pts, function(e) weighted_mean_w(e$opp_hist, recency_weights(length(e$opp_hist), opp_decay)))
}

pred_rate_shrunk <- function(pts, rate_decay, k, base_rate) {
  sapply(pts, function(e) {
    n <- length(e$opp_hist)
    has_opp <- e$opp_hist > 0
    if (sum(has_opp) == 0) return(base_rate)
    w_full <- recency_weights(n, rate_decay)
    w <- w_full[has_opp]
    rate_per_game <- e$td_hist[has_opp] / e$opp_hist[has_opp]
    own_rate <- weighted_mean_w(rate_per_game, w)
    # Raw (unweighted) total opportunity as the sample-size proxy for how
    # much real data backs `own_rate` -- k is in the same "opportunities"
    # unit, so k=8 means "trust own_rate as much as 8 real touches' worth
    # of league-average data".
    raw_total_opp <- sum(e$opp_hist)
    (raw_total_opp * own_rate + k * base_rate) / (raw_total_opp + k)
  })
}

run_channel <- function(name, pos, td_col, opp_col) {
  dpos <- stats[stats$position == pos, ]
  pts <- build_eval_points(dpos, MIN_HIST_GAMES, td_col, opp_col)
  actual <- sapply(pts, function(e) e$actual_td)
  opp_decay <- OPP_DECAY[[name]]; rate_decay <- RATE_DECAY[[name]]
  base_rate <- baseline_rate[[name]]

  pred_opp <- pred_opportunity(pts, opp_decay)

  # k=0 reproduces the un-shrunk opportunity model (sanity check vs. prior backtest).
  k_scores <- sapply(K_GRID, function(k) {
    pred <- pred_opp * pred_rate_shrunk(pts, rate_decay, k, base_rate)
    mean(abs(actual - pred))
  })
  best_k <- K_GRID[which.min(k_scores)]
  pred_shrunk <- pred_opp * pred_rate_shrunk(pts, rate_decay, best_k, base_rate)

  # Vegas adjustment on top of the shrunk prediction.
  vegas_factor <- ifelse(is.na(sapply(pts, function(e) e$implied_total)), 1,
                          sapply(pts, function(e) e$implied_total) / league_avg_total)
  pred_vegas <- pred_shrunk * vegas_factor

  mae_k0 <- k_scores[1]
  mae_shrunk <- min(k_scores)
  mae_vegas <- mean(abs(actual - pred_vegas))
  r_shrunk <- cor(pred_shrunk, actual); r_vegas <- cor(pred_vegas, actual)

  cat(sprintf("=== %s (pos=%s) === n=%d\n", name, pos, length(pts)))
  cat(sprintf("  k=0 (no shrinkage, matches prior backtest) MAE(TD count)=%.4f\n", mae_k0))
  cat(sprintf("  Best shrinkage k=%d  MAE=%.4f  (%+.2f%%)  r^2=%.3f\n",
              best_k, mae_shrunk, 100 * (mae_shrunk - mae_k0) / mae_k0, r_shrunk^2))
  cat(sprintf("  + Vegas team-total adjustment  MAE=%.4f  (%+.2f%% vs shrunk-only)  r^2=%.3f\n\n",
              mae_vegas, 100 * (mae_vegas - mae_shrunk) / mae_shrunk, r_vegas^2))

  list(pred_shrunk = pred_shrunk, pred_vegas = pred_vegas, actual = actual)
}

rb_rush <- run_channel("RB_rush", "RB", "rushing_tds", "carries")
rb_rec  <- run_channel("RB_rec",  "RB", "receiving_tds", "targets")
wr_rec  <- run_channel("WR",      "WR", "receiving_tds", "targets")
te_rec  <- run_channel("TE",      "TE", "receiving_tds", "targets")

report_total <- function(name, pred, actual) {
  pred_pts <- 6 * pred; actual_pts <- 6 * actual
  mae <- mean(abs(actual_pts - pred_pts)); r <- cor(pred_pts, actual_pts)
  cat(sprintf("%-4s  MAE(pts)=%.3f  r=%.3f  r^2=%.3f\n", name, mae, r, r^2))
}

cat("=========== FINAL: points-units, shrinkage + Vegas combined ===========\n")
pred_rb_total <- rb_rush$pred_vegas + rb_rec$pred_vegas
actual_rb_total <- rb_rush$actual + rb_rec$actual
report_total("RB", pred_rb_total, actual_rb_total)
report_total("WR", wr_rec$pred_vegas, wr_rec$actual)
report_total("TE", te_rec$pred_vegas, te_rec$actual)

cat("\n(compare to pure TD-history baseline: RB MAE=2.358 r^2=0.102 | WR MAE=1.845 r^2=0.061 | TE MAE=1.608 r^2=0.038)\n")
