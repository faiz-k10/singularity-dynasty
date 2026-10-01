# Backtest: does STAT_GROUP_DECAY (projection_engine.R) need a separate,
# faster-reacting value for players with very little history?
#
# Motivation: backtest_stat_group_decay.R (which produced the live 0.82/0.85/
# 0.94 yardage decays and 0.94/0.94/0.94/0.97 td_int decays) only evaluates
# players with MIN_HIST_GAMES=8+ games of history -- established veterans
# whose recent-vs-old split is normal week-to-week variance, not a genuine
# role change. That decay is then applied, unmodified, to EVERY player
# regardless of sample size -- including a just-emerged rookie with 2-5
# games of history whose "old" games may predate a real role change
# entirely (backup -> featured target earner). Concrete case: Matthew
# Golden's Week 3 2026 Redraft projection weighted three buried-bench
# 2025 rookie games (0-1 receptions each) against two 2026 games with a
# clearly larger role (6 and 4 receptions on 12 and 6 targets) and landed
# at 2.75 projected receptions -- nowhere close to his actual usage.
#
# This script checks whether a decay tuned SPECIFICALLY on low-history
# players (2-7 games, i.e. below the existing MIN_HIST_GAMES eligibility
# floor) beats reusing the veteran-tuned global decay on that same
# population, for next-game accuracy (matches Redraft's actual use case --
# NOT the season-total bootstrap target backtest_stat_group_decay.R uses,
# since the low-sample scenario is inherently an in-season, early-career
# problem, same methodology backtest_snap_filter_decay.R used to re-sweep
# MED_DECAY).
#
# Deliberately does NOT touch MIN_HIST_GAMES itself, the "building" vs.
# "established" sample_confidence label, or any other stat group beyond
# what's swept here -- this is scoped to answering one question: is a
# separate low-sample decay actually better, and by how much, per
# position/stat-group. If the answer is yes, wiring a sample-size-gated
# decay into projection_engine.R (and re-checking Player Season
# Simulations' season-total accuracy isn't hurt) is a separate follow-up.
#
# Run: Rscript backtest_low_sample_decay.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
DECAY_GRID <- seq(0.60, 0.97, by = 0.03)  # wider/lower floor than the veteran
                                            # sweep's 0.70 -- a real role-change
                                            # signal may want to react faster
                                            # than anything tuned on veterans
LOW_SAMPLE_MIN <- 2   # need at least 2 games for decay to matter at all
LOW_SAMPLE_MAX <- 7   # one below the existing MIN_HIST_GAMES=8 eligibility floor
ESTABLISHED_MIN <- 8  # matches backtest_stat_group_decay.R's MIN_HIST_GAMES,
                       # used here as a sanity-check slice only (should roughly
                       # reproduce the live decays, modulo next-game vs.
                       # season-total target difference)

STAT_COLS <- c("passing_yards", "passing_tds", "passing_interceptions",
               "rushing_yards", "rushing_tds",
               "receptions", "receiving_yards", "receiving_tds")

# Same split as backtest_stat_group_decay.R -- kept identical so results are
# directly comparable stat-group-for-stat-group against the live decays.
TD_INT_STATS_BY_POS <- list(
  QB = c("passing_tds", "passing_interceptions", "rushing_tds"),
  RB = c("rushing_tds", "receiving_tds"),
  WR = c("receiving_tds"),
  TE = c("receiving_tds")
)
YARDAGE_STATS_BY_POS <- list(
  QB = c("passing_yards", "rushing_yards"),
  RB = c("rushing_yards", "receiving_yards", "receptions"),
  WR = c("receiving_yards", "receptions"),
  TE = c("receiving_yards", "receptions")
)
LIVE_DECAY <- list(
  td_int  = c(QB = 0.97, RB = 0.94, WR = 0.94, TE = 0.97),
  yardage = c(QB = 0.82, RB = 0.85, WR = 0.82, TE = 0.94)
)

recency_weights <- function(n, d) { w <- d ^ ((n - 1):0); w / sum(w) }
weighted_mean_w <- function(x, w) sum(x * w) / sum(w)

cat("Loading nflreadr data for seasons", min(TEST_SEASONS) - LOOKBACK_YEARS, "-", max(TEST_SEASONS), "...\n")
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
reg_all <- raw[raw$season_type == "REG",
               c("player_display_name", "position", "season", "week", STAT_COLS)]
reg_all <- reg_all[reg_all$position %in% c("QB", "RB", "WR", "TE"), ]
reg_all <- reg_all[!(reg_all$week %in% EXCLUDE_WEEKS), ]
for (col in STAT_COLS) reg_all[[col]][is.na(reg_all[[col]])] <- 0
cat("Loaded", nrow(reg_all), "player-game rows.\n\n")

# Builds one eval point per (player, game k) where the player's history
# BEFORE game k (chronological, across seasons -- a mid-career-debut rookie's
# "history" legitimately spans two seasons, same as Golden's case) has
# between min_hist and max_hist games. Target is game k itself (next-game
# accuracy), not a season total.
build_eval_points_range <- function(dataset, min_hist, max_hist) {
  pts <- list(); i <- 0
  for (p in unique(dataset$player_display_name)) {
    d <- dataset[dataset$player_display_name == p, ]
    d <- d[order(d$season, d$week), ]
    n <- nrow(d)
    if (n < min_hist + 1) next
    upper_k <- min(max_hist + 1, n)
    for (k in (min_hist + 1):upper_k) {
      if (!(d$season[k] %in% TEST_SEASONS)) next
      i <- i + 1
      pts[[i]] <- list(hist = d[1:(k - 1), ], actual = d[k, ])
    }
  }
  pts
}

sweep_decay <- function(pts, col, decay_grid) {
  sapply(decay_grid, function(dc) {
    mean(sapply(pts, function(e) {
      w <- recency_weights(nrow(e$hist), dc)
      abs(e$actual[[col]] - weighted_mean_w(e$hist[[col]], w))
    }))
  })
}

positions <- c("QB", "RB", "WR", "TE")
groups <- list(td_int = TD_INT_STATS_BY_POS, yardage = YARDAGE_STATS_BY_POS)
results <- list()

for (pos in positions) {
  dpos <- reg_all[reg_all$position == pos, ]
  low_pts <- build_eval_points_range(dpos, LOW_SAMPLE_MIN, LOW_SAMPLE_MAX)
  est_pts <- build_eval_points_range(dpos, ESTABLISHED_MIN, 999)
  cat("===", pos, "=== low-sample eval points:", length(low_pts),
      " established eval points:", length(est_pts), "\n")

  for (group_name in names(groups)) {
    stat_cols <- groups[[group_name]][[pos]]
    if (is.null(stat_cols) || length(stat_cols) == 0) next

    for (col in stat_cols) {
      cat("  --", col, "--\n")

      low_scores <- sweep_decay(low_pts, col, DECAY_GRID)
      names(low_scores) <- DECAY_GRID
      best_low <- DECAY_GRID[which.min(low_scores)]

      est_scores <- sweep_decay(est_pts, col, DECAY_GRID)
      names(est_scores) <- DECAY_GRID
      best_est <- DECAY_GRID[which.min(est_scores)]

      live_decay <- LIVE_DECAY[[group_name]][pos]
      live_mae_on_low <- mean(sapply(low_pts, function(e) {
        w <- recency_weights(nrow(e$hist), live_decay)
        abs(e$actual[[col]] - weighted_mean_w(e$hist[[col]], w))
      }))
      best_low_mae <- min(low_scores)

      cat(sprintf("    best decay (low-sample, n=%d):  %.2f  MAE=%.4f\n",
                  length(low_pts), best_low, best_low_mae))
      cat(sprintf("    best decay (established, n=%d): %.2f  MAE=%.4f  (sanity check vs. live %.2f)\n",
                  length(est_pts), best_est, min(est_scores), live_decay))
      cat(sprintf("    LIVE decay %.2f applied to low-sample slice: MAE=%.4f\n", live_decay, live_mae_on_low))
      cat(sprintf("    -> low-sample-tuned decay change vs. live decay: %+.2f%%\n\n",
                  100 * (best_low_mae - live_mae_on_low) / live_mae_on_low))

      results[[paste(pos, group_name, col, sep = "_")]] <- list(
        n_low = length(low_pts), n_est = length(est_pts),
        best_low_decay = best_low, best_low_mae = best_low_mae,
        best_est_decay = best_est, best_est_mae = min(est_scores),
        live_decay = live_decay, live_mae_on_low = live_mae_on_low,
        low_scores = low_scores, est_scores = est_scores
      )
    }
  }
}

cat("\n\n=========== SUMMARY ===========\n")
cat(sprintf("%-6s %-9s %-20s %-14s %-14s %-10s\n",
            "Pos", "Group", "Stat", "LiveDecay", "BestLowDecay", "Change%"))
for (nm in names(results)) {
  r <- results[[nm]]
  parts <- strsplit(nm, "_")[[1]]
  pos <- parts[1]; group <- parts[2]; col <- paste(parts[-(1:2)], collapse = "_")
  change_pct <- 100 * (r$best_low_mae - r$live_mae_on_low) / r$live_mae_on_low
  cat(sprintf("%-6s %-9s %-20s %-14.2f %-14.2f %+.2f%%\n",
              pos, group, col, r$live_decay, r$best_low_decay, change_pct))
}

saveRDS(results, "backtest_low_sample_decay_results.rds")
cat("\nFull results saved to backtest_low_sample_decay_results.rds\n")
