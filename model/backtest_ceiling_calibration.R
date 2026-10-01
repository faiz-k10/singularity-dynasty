# Backtest: freshly (re-)calibrate CEIL_Q (projection_engine.R), the
# weekly Redraft/Best Ball ceiling's internal quantile.
#
# Motivation: unlike STAT_GROUP_FLOOR_Q/CEIL_Q (Player Season Simulations),
# CEIL_Q/FLOOR_Q for the WEEKLY number were never actually walk-forward
# validated by any backtest script in this repo (grepped every
# backtest_*.R -- none calibrates them). Real 2026 Weeks 1-3 data now
# shows why that matters: floor coverage is right on target (9.3% of real
# outcomes land below the published floor, matching FLOOR_Q's implied
# 8-13% design), but CEILING coverage is running hot -- 8.2% of real
# outcomes exceed the published ceiling, roughly DOUBLE what CEIL_Q's
# literal value (0.94-0.96, implying a 4-6% exceed rate) is supposed to
# produce. Same "biggest misses" list from that live check is entirely
# one-sided -- big positive surprises (Davante Adams +26.9, Kenneth
# Walker III +26.4, etc.), zero big disappointments in the top 10.
#
# Same calibration CONCEPT this codebase already uses elsewhere
# (STAT_GROUP_FLOOR_Q/CEIL_Q's own comment: "query the simulated
# distribution at an internal quantile other than the literal 0.10/0.90 so
# the REAL exceed rate actually comes out near 10%/90%") -- the number fed
# into weighted_quantile() is a calibration LEVER, not a literal
# probability claim. This script finds the lever value that actually
# produces CEIL_Q's own INTENDED real-world exceed rate (1 - CEIL_Q per
# position: QB/RB/TE 4%, WR 6%) via real walk-forward next-game
# validation (2022-2025, same discipline/eligibility as every other
# next-game backtest here), then separately checks the result against the
# real 2026 Weeks 1-3 data that surfaced the problem in the first place.
# CEIL_DECAY itself is left untouched -- this only re-sweeps the quantile.
#
# Run: Rscript backtest_ceiling_calibration.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 6
CEIL_DECAY <- c(RB = 0.89, QB = 0.98, WR = 0.93, TE = 0.91)  # unchanged, live value
CURRENT_CEIL_Q <- c(RB = 0.96, QB = 0.96, WR = 0.94, TE = 0.96)  # unchanged, live value
TARGET_ABOVE_RATE <- 1 - CURRENT_CEIL_Q  # the rate CEIL_Q is SUPPOSED to produce
Q_GRID <- seq(0.90, 0.995, by = 0.005)

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_quantile <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]
  cw <- cumsum(w) / sum(w)
  k <- which(cw >= q)[1]
  if (k == 1) return(x[1])
  x[k - 1] + ((q - cw[k - 1]) / (cw[k] - cw[k - 1])) * (x[k] - x[k - 1])
}

cat("Loading nflreadr data (2019-2025 walk-forward)...\n")
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
d_all <- raw[raw$season_type == "REG",
             c("player_id", "player_display_name", "position", "season", "week", "fantasy_points_ppr")]
d_all <- d_all[d_all$position %in% c("QB", "RB", "WR", "TE"), ]
d_all <- d_all[!(d_all$week %in% EXCLUDE_WEEKS), ]
d_all <- d_all[!is.na(d_all$fantasy_points_ppr), ]
d_all <- d_all[order(d_all$player_id, d_all$season, d_all$week), ]
cat("Loaded", nrow(d_all), "player-game rows.\n\n")

build_eval_points <- function(dataset, min_hist) {
  pts <- list(); i <- 0
  for (pid in unique(dataset$player_id)) {
    d <- dataset[dataset$player_id == pid, ]
    n <- nrow(d)
    if (n < min_hist + 1) next
    for (k in (min_hist + 1):n) {
      if (!(d$season[k] %in% TEST_SEASONS)) next
      i <- i + 1
      pts[[i]] <- list(hist = d[1:(k - 1), ]$fantasy_points_ppr, actual = d$fantasy_points_ppr[k])
    }
  }
  pts
}

results <- list()
cat("=== CEIL_Q sweep, walk-forward 2022-2025 next-game accuracy ===\n")
for (pos in c("QB", "RB", "WR", "TE")) {
  dpos <- d_all[d_all$position == pos, ]
  pts <- build_eval_points(dpos, MIN_HIST_GAMES)
  cat("\n--", pos, "-- eval points:", length(pts), " target above-ceiling rate:",
      sprintf("%.1f%%", 100 * TARGET_ABOVE_RATE[pos]), "\n")

  above_rate_by_q <- sapply(Q_GRID, function(q) {
    mean(sapply(pts, function(e) {
      w <- recency_weights(length(e$hist), CEIL_DECAY[pos])
      ceil_pred <- weighted_quantile(e$hist, w, q)
      e$actual > ceil_pred
    }))
  })
  names(above_rate_by_q) <- Q_GRID

  # Current live CEIL_Q's real achieved rate, for comparison.
  current_rate <- mean(sapply(pts, function(e) {
    w <- recency_weights(length(e$hist), CEIL_DECAY[pos])
    ceil_pred <- weighted_quantile(e$hist, w, CURRENT_CEIL_Q[pos])
    e$actual > ceil_pred
  }))

  best_q <- Q_GRID[which.min(abs(above_rate_by_q - TARGET_ABOVE_RATE[pos]))]
  best_rate <- above_rate_by_q[as.character(best_q)]

  cat(sprintf("  Current CEIL_Q=%.2f  -> real above-ceiling rate=%.1f%% (target %.1f%%)\n",
              CURRENT_CEIL_Q[pos], 100 * current_rate, 100 * TARGET_ABOVE_RATE[pos]))
  cat(sprintf("  Recalibrated CEIL_Q=%.3f -> real above-ceiling rate=%.1f%%\n", best_q, 100 * best_rate))

  results[[pos]] <- list(current_q = CURRENT_CEIL_Q[pos], current_rate = current_rate,
                          best_q = best_q, best_rate = best_rate, sweep = above_rate_by_q)
}

cat("\n\n=========== SUMMARY ===========\n")
cat(sprintf("%-4s %-10s %-16s %-10s %-16s\n", "Pos", "OldQ", "OldRealRate", "NewQ", "NewRealRate"))
for (pos in names(results)) {
  r <- results[[pos]]
  cat(sprintf("%-4s %-10.2f %-16s %-10.3f %-16s\n",
              pos, r$current_q, sprintf("%.1f%%", 100 * r$current_rate),
              r$best_q, sprintf("%.1f%%", 100 * r$best_rate)))
}

saveRDS(results, "backtest_ceiling_calibration_results.rds")
cat("\nFull results saved to backtest_ceiling_calibration_results.rds\n")
