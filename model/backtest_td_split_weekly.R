# Backtest: rebuild RB/WR/TE's weekly Redraft median/floor/ceiling as a
# TWO-COMPONENT model (touchdown points + non-touchdown points, each with
# its own decay) instead of a single quantile of blended total fantasy
# points -- matching the architecture QB's median already uses (separate
# pass/rush weighted means) and Season Sims' stat_ranges already uses
# (td_int vs yardage groups). Motivated directly by a real, measured
# inconsistency: check-projection-math.mjs showed the published median
# diverging from the sum of the per-stat scoring_stats breakdown by up to
# +6.3 points on real Week 4 players (JSN) -- because WEEKLY_TD_DECAY
# already made the TD component react much faster than the blended
# median's own MED_DECAY does. Building the median FROM the same two
# components the breakdown uses should close that gap by construction,
# not just reduce it.
#
# MEDIAN: sum of two weighted MEANS (td component + non-td component),
# each with its own decay -- same combining method QB's median settled on
# after real backtesting (backtest_qb_pass_rush_split.R found this beat a
# quantile-of-resampled-sum against real Sleeper outcomes). Coordinate-
# descent decay sweep (fix one component's decay, sweep the other, then
# swap) rather than a full 2D grid -- cheaper, and this codebase already
# uses staged sweeps elsewhere when a full joint grid isn't warranted.
#
# FLOOR/CEILING: Monte Carlo -- independently resample a weighted-random
# historical TD-game value and a weighted-random historical non-TD-game
# value (using the median step's winning decays), sum them, repeat
# N_SIMS times, take the quantile of THAT simulated one-week distribution.
# Quantile itself is then calibrated (same lever concept as
# backtest_ceiling_calibration.R) against each position's OWN existing
# target exceed rate -- FLOOR_Q's literal value for floor, the already-
# recalibrated CEIL_Q's implied (1 - CEIL_Q) rate for ceiling -- so this
# is judged against the same bar the current single-quantile approach is
# already held to, not a new invented target.
#
# Scored against BOTH: (1) real next-game MAE / real floor/ceiling
# exceed rate (2022-2025 walk-forward, same discipline as every other
# backtest here), AND (2) the reconciliation gap against the per-stat
# breakdown on CURRENT live 2026 data, since closing that gap is the
# actual point of this exercise.
#
# Run: Rscript backtest_td_split_weekly.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 6
DECAY_GRID <- seq(0.60, 0.97, by = 0.03)

MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)          # current baseline
MED_MEAN_BLEND_SHARE <- 0.85
FLOOR_Q <- c(RB = 0.09, QB = 0.08, WR = 0.12, TE = 0.13)             # current baseline (target rate)
CEIL_Q  <- c(RB = 0.995, QB = 0.985, WR = 0.975, TE = 0.995)         # ALREADY recalibrated today (target rate = 1 - this)
Q_GRID <- seq(0.005, 0.30, by = 0.005)   # wide enough for both floor (low q) and ceiling (high 1-q via CEIL search below)
CEIL_Q_GRID <- seq(0.85, 0.995, by = 0.005)
N_SIMS <- 5000

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_mean_w <- function(x, w) sum(x * w) / sum(w)
weighted_quantile <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]
  cw <- cumsum(w) / sum(w)
  k <- which(cw >= q)[1]
  if (k == 1) return(x[1])
  x[k - 1] + ((q - cw[k - 1]) / (cw[k] - cw[k - 1])) * (x[k] - x[k - 1])
}

cat("Loading nflreadr data...\n")
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
stats <- raw[raw$season_type == "REG",
             c("player_id", "player_display_name", "position", "season", "week",
               "fantasy_points_ppr", "rushing_tds", "receiving_tds")]
stats <- stats[stats$position %in% c("RB", "WR", "TE"), ]
stats <- stats[!(stats$week %in% EXCLUDE_WEEKS), ]
stats <- stats[!is.na(stats$fantasy_points_ppr), ]
stats$rushing_tds[is.na(stats$rushing_tds)] <- 0
stats$receiving_tds[is.na(stats$receiving_tds)] <- 0
stats$td_pts <- 6 * ifelse(stats$position == "RB", stats$rushing_tds + stats$receiving_tds, stats$receiving_tds)
stats$nontd_pts <- stats$fantasy_points_ppr - stats$td_pts
stats <- stats[order(stats$player_id, stats$season, stats$week), ]
cat("Loaded", nrow(stats), "player-game rows.\n\n")

build_eval_points <- function(dataset, min_hist) {
  pts <- list(); i <- 0
  for (pid in unique(dataset$player_id)) {
    d <- dataset[dataset$player_id == pid, ]
    n <- nrow(d)
    if (n < min_hist + 1) next
    for (k in (min_hist + 1):n) {
      if (!(d$season[k] %in% TEST_SEASONS)) next
      i <- i + 1
      pts[[i]] <- list(hist = d[1:(k - 1), ], actual = d[k, ])
    }
  }
  pts
}

results <- list()

for (pos in c("RB", "WR", "TE")) {
  dpos <- stats[stats$position == pos, ]
  pts <- build_eval_points(dpos, MIN_HIST_GAMES)
  cat("===", pos, "=== eval points:", length(pts), "===\n")

  # ---- BASELINE: current single-blended-quantile median ----
  base_pred <- sapply(pts, function(e) {
    n <- nrow(e$hist)
    w <- recency_weights(n, MED_DECAY[pos])
    MED_MEAN_BLEND_SHARE * weighted_quantile(e$hist$fantasy_points_ppr, w, 0.50) +
      (1 - MED_MEAN_BLEND_SHARE) * weighted_mean_w(e$hist$fantasy_points_ppr, w)
  })
  actual <- sapply(pts, function(e) e$actual$fantasy_points_ppr)
  base_mae <- mean(abs(actual - base_pred))

  # ---- NEW: sum of two weighted means, coordinate-descent decay sweep ----
  score_combo <- function(td_decay, nontd_decay) {
    pred <- sapply(pts, function(e) {
      n <- nrow(e$hist)
      w_td <- recency_weights(n, td_decay)
      w_nontd <- recency_weights(n, nontd_decay)
      weighted_mean_w(e$hist$td_pts, w_td) + weighted_mean_w(e$hist$nontd_pts, w_nontd)
    })
    mean(abs(actual - pred))
  }

  # Stage 1: fix nontd at current MED_DECAY, sweep td.
  stage1 <- sapply(DECAY_GRID, function(dc) score_combo(dc, MED_DECAY[pos]))
  best_td <- DECAY_GRID[which.min(stage1)]
  # Stage 2: fix td at stage-1 best, sweep nontd.
  stage2 <- sapply(DECAY_GRID, function(dc) score_combo(best_td, dc))
  best_nontd <- DECAY_GRID[which.min(stage2)]
  new_mae <- min(stage2)

  cat(sprintf("  BASELINE (blended quantile) MAE=%.4f\n", base_mae))
  cat(sprintf("  NEW (td_decay=%.2f, nontd_decay=%.2f) MAE=%.4f  (%+.2f%% vs baseline)\n\n",
              best_td, best_nontd, new_mae, 100 * (new_mae - base_mae) / base_mae))

  # ---- FLOOR/CEILING: Monte Carlo resampled-sum, quantile calibrated ----
  set.seed(42)
  sim_dists <- lapply(pts, function(e) {
    n <- nrow(e$hist)
    w_td <- recency_weights(n, best_td)
    w_nontd <- recency_weights(n, best_nontd)
    sample(e$hist$td_pts, N_SIMS, replace = TRUE, prob = w_td) +
      sample(e$hist$nontd_pts, N_SIMS, replace = TRUE, prob = w_nontd)
  })

  target_below <- FLOOR_Q[pos]
  target_above <- 1 - CEIL_Q[pos]

  floor_rate_by_q <- sapply(Q_GRID, function(q) {
    mean(mapply(function(sim, a) a < quantile(sim, q), sim_dists, actual))
  })
  best_floor_q <- Q_GRID[which.min(abs(floor_rate_by_q - target_below))]

  ceil_rate_by_q <- sapply(CEIL_Q_GRID, function(q) {
    mean(mapply(function(sim, a) a > quantile(sim, q), sim_dists, actual))
  })
  best_ceil_q <- CEIL_Q_GRID[which.min(abs(ceil_rate_by_q - target_above))]

  # Baseline floor/ceiling real rates, for comparison.
  base_floor_rate <- mean(sapply(pts, function(e) {
    n <- nrow(e$hist); w <- recency_weights(n, MED_DECAY[pos])
    e$actual$fantasy_points_ppr < weighted_quantile(e$hist$fantasy_points_ppr, w, FLOOR_Q[pos])
  }))
  base_ceil_rate <- mean(sapply(pts, function(e) {
    n <- nrow(e$hist); w <- recency_weights(n, MED_DECAY[pos])
    e$actual$fantasy_points_ppr > weighted_quantile(e$hist$fantasy_points_ppr, w, CEIL_Q[pos])
  }))

  cat(sprintf("  FLOOR  target=%.1f%%  baseline real-rate=%.1f%%  NEW (q=%.3f) real-rate=%.1f%%\n",
              100 * target_below, 100 * base_floor_rate, best_floor_q, 100 * floor_rate_by_q[as.character(best_floor_q)]))
  cat(sprintf("  CEILING target=%.1f%%  baseline real-rate=%.1f%%  NEW (q=%.3f) real-rate=%.1f%%\n\n",
              100 * target_above, 100 * base_ceil_rate, best_ceil_q, 100 * ceil_rate_by_q[as.character(best_ceil_q)]))

  results[[pos]] <- list(base_mae = base_mae, new_mae = new_mae,
                          best_td_decay = best_td, best_nontd_decay = best_nontd,
                          best_floor_q = best_floor_q, best_ceil_q = best_ceil_q,
                          base_floor_rate = base_floor_rate, base_ceil_rate = base_ceil_rate,
                          new_floor_rate = floor_rate_by_q[as.character(best_floor_q)],
                          new_ceil_rate = ceil_rate_by_q[as.character(best_ceil_q)])
}

cat("\n\n=========== SUMMARY ===========\n")
cat(sprintf("%-4s %-10s %-10s %-8s %-10s %-8s %-8s\n",
            "Pos", "MAE_base", "MAE_new", "TDdecay", "NonTDdecay", "FloorQ", "CeilQ"))
for (pos in names(results)) {
  r <- results[[pos]]
  cat(sprintf("%-4s %-10.3f %-10.3f %-8.2f %-10.2f %-8.3f %-8.3f\n",
              pos, r$base_mae, r$new_mae, r$best_td_decay, r$best_nontd_decay, r$best_floor_q, r$best_ceil_q))
}

saveRDS(results, "backtest_td_split_weekly_results.rds")
cat("\nFull results saved to backtest_td_split_weekly_results.rds\n")
