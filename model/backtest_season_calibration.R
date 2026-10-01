# Backtest: freshly calibrate Player Season Simulations' season_floor/
# season_ceiling (projection_engine.R), currently a literal, never-
# validated 0.10/0.90 quantile of the season-total bootstrap distribution.
#
# Motivation: that literal 0.10/0.90 was justified by a comment arguing
# "it's already a large Monte Carlo sample, so a plain empirical quantile
# is the right tool here" -- conflating estimation NOISE (which a big
# bootstrap sample does reduce) with distributional BIAS (which it does
# not fix if the resampled distribution itself doesn't capture real
# season-to-season volatility -- role changes, injuries, career
# trajectory shifts, none of which a bootstrap of a player's own weighted
# historical games can represent). Real walk-forward validation against
# 2022-2025 actual season totals confirmed the bias is real and large:
#
#   Pos  below-10th%  above-90th%   (target 10%/10% both)
#   QB   21.8%        17.2%
#   RB   33.2%        19.9%
#   WR   29.5%        20.1%
#   TE   23.6%        19.6%
#
# Both tails run roughly 2-3x hotter than intended, at every position --
# a materially bigger gap than the weekly Redraft ceiling bug
# (backtest_ceiling_calibration.R) already fixed.
#
# Method: same walk-forward discipline as backtest_stat_group_decay.R
# (2022-2025 test seasons, 3-year lookback, real season totals as ground
# truth), but efficient about it -- the season bootstrap (`szn`, N_SIMS
# draws) is built ONCE per (player, season) eval point, then EVERY
# candidate quantile in the sweep grid is checked against that same
# cached distribution (no need to re-simulate per grid point, since only
# the quantile EXTRACTION changes, not the underlying draws). Sweeps floor
# downward from 0.10 (need a LOWER predicted floor to reduce how often
# real totals fall under it) and ceiling upward from 0.90 (need a HIGHER
# predicted ceiling to reduce how often real totals exceed it),
# independently per position, to find where each hits its own real 10%
# target. MED_DECAY (which the szn bootstrap itself uses) is untouched --
# this only re-sweeps the two quantile inputs.
#
# Run: Rscript backtest_season_calibration.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_GAMES <- 6
MAX_GAMES_PER_SEASON <- 16
MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
N_SIMS <- 8000
FLOOR_GRID <- seq(0.01, 0.10, by = 0.005)
CEIL_GRID <- seq(0.90, 0.995, by = 0.005)
TARGET_RATE <- 0.10  # both tails' shared intended target

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }

cat("Loading nflreadr data...\n")
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
reg_all <- raw[raw$season_type == "REG",
                c("player_id", "player_display_name", "position", "season", "week", "fantasy_points_ppr")]
reg_all <- reg_all[reg_all$position %in% c("QB", "RB", "WR", "TE"), ]
reg_all <- reg_all[!(reg_all$week %in% EXCLUDE_WEEKS), ]
reg_all <- reg_all[!is.na(reg_all$fantasy_points_ppr), ]
cat("Loaded", nrow(reg_all), "player-game rows.\n\n")

results <- list()
set.seed(42)

for (pos in c("QB", "RB", "WR", "TE")) {
  below_counts <- setNames(rep(0, length(FLOOR_GRID)), FLOOR_GRID)
  above_counts <- setNames(rep(0, length(CEIL_GRID)), CEIL_GRID)
  n_eval <- 0

  for (Y in TEST_SEASONS) {
    hist_seasons <- (Y - LOOKBACK_YEARS):(Y - 1)
    hist <- reg_all[reg_all$season %in% hist_seasons & reg_all$position == pos, ]
    actual <- reg_all[reg_all$season == Y & reg_all$position == pos, ]
    counts <- table(hist$player_id)
    players <- names(counts[counts >= MIN_GAMES])

    for (pid in players) {
      d <- hist[hist$player_id == pid, ]
      d <- d[order(d$season, d$week), ]
      x <- d$fantasy_points_ppr
      n <- length(x)

      a <- actual[actual$player_id == pid, ]
      games_played <- nrow(a)
      if (games_played < 4) next  # need a real season's worth of games to compare against
      real_total <- sum(a$fantasy_points_ppr)
      avail <- min(games_played / MAX_GAMES_PER_SEASON, 1)

      wm <- recency_weights(n, MED_DECAY[pos])
      szn <- replicate(N_SIMS, {
        g <- sum(runif(MAX_GAMES_PER_SEASON) < avail)
        if (g == 0) 0 else sum(sample(x, g, replace = TRUE, prob = wm))
      })

      for (q in FLOOR_GRID) {
        fl <- as.numeric(quantile(szn, q))
        if (real_total < fl) below_counts[as.character(q)] <- below_counts[as.character(q)] + 1
      }
      for (q in CEIL_GRID) {
        ce <- as.numeric(quantile(szn, q))
        if (real_total > ce) above_counts[as.character(q)] <- above_counts[as.character(q)] + 1
      }
      n_eval <- n_eval + 1
    }
  }

  below_rate <- below_counts / n_eval
  above_rate <- above_counts / n_eval
  best_floor_q <- FLOOR_GRID[which.min(abs(below_rate - TARGET_RATE))]
  best_ceil_q <- CEIL_GRID[which.min(abs(above_rate - TARGET_RATE))]

  cat("===", pos, "=== eval points:", n_eval, "===\n")
  cat(sprintf("  Current floor_q=0.10 -> real below-rate=%.1f%%\n", 100 * below_rate["0.1"]))
  cat(sprintf("  Recalibrated floor_q=%.3f -> real below-rate=%.1f%%\n", best_floor_q, 100 * below_rate[as.character(best_floor_q)]))
  cat(sprintf("  Current ceil_q=0.90  -> real above-rate=%.1f%%\n", 100 * above_rate["0.9"]))
  cat(sprintf("  Recalibrated ceil_q=%.3f -> real above-rate=%.1f%%\n\n", best_ceil_q, 100 * above_rate[as.character(best_ceil_q)]))

  results[[pos]] <- list(n_eval = n_eval, best_floor_q = best_floor_q, best_ceil_q = best_ceil_q,
                          below_rate = below_rate, above_rate = above_rate)
}

cat("\n=========== SUMMARY ===========\n")
cat(sprintf("%-4s %-14s %-14s\n", "Pos", "NewFloorQ", "NewCeilQ"))
for (pos in names(results)) {
  cat(sprintf("%-4s %-14.3f %-14.3f\n", pos, results[[pos]]$best_floor_q, results[[pos]]$best_ceil_q))
}

saveRDS(results, "backtest_season_calibration_results.rds")
cat("\nFull results saved to backtest_season_calibration_results.rds\n")
