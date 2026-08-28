# Backtest: MIN_SNAP_PCT (projection_engine.R) removes ~48% of all
# player-games from history (any game at or below 50% offensive snap
# share). That's a big enough change to the underlying data that every
# decay value tuned against the OLD unfiltered history can't just be
# assumed to still be right -- same "always retune after any
# eligibility-threshold change" discipline this file already applies to
# MIN_GAMES changes (see README).
#
# Re-sweeps the two decay families that drive the live weekly Redraft
# number directly: MED_DECAY (all 4 positions, next-game MAE, same
# target/methodology as the original) and PASS_PTS_DECAY_QB/
# RUSH_PTS_DECAY_QB (same walk-forward quantile-of-resampled-sum target
# as backtest_qb_pass_rush_split.R). Does NOT re-sweep CEIL_DECAY,
# FLOOR_Q/CEIL_Q, or the secondary WOPR/EPA/target-share/stat-group
# decays -- those still reuse their old unfiltered-data values as a
# flagged approximation, see README.
#
# Also reports head-to-head: new decay + filtered data vs. old decay +
# UNFILTERED data, so the filter's net effect (not just "does some decay
# value exist that works on the new data") is actually validated.
#
# Run: Rscript backtest_snap_filter_decay.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 8
MIN_SNAP_PCT <- 0.50
DECAY_GRID <- seq(0.70, 0.97, by = 0.03)
OLD_MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
OLD_PASS_DECAY <- 0.79
OLD_RUSH_DECAY <- 0.88

normalize_join_name <- function(name) {
  tolower(gsub("\\s+(jr|sr|ii|iii|iv|v)$", "", gsub("\\.", "", name), ignore.case = TRUE))
}
recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_quantile <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]
  cw <- (cumsum(w) - 0.5 * w) / sum(w)
  as.numeric(approx(cw, x, q, rule = 2)$y)
}

cat("Loading nflreadr data...\n")
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
reg <- raw[raw$season_type == "REG",
           c("player_display_name", "position", "season", "week", "fantasy_points_ppr",
             "passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds")]
reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
reg <- reg[!is.na(reg$fantasy_points_ppr), ]
for (col in c("passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds")) {
  reg[[col]][is.na(reg[[col]])] <- 0
}
reg$pass_pts <- 0.04 * reg$passing_yards + 4 * reg$passing_tds - 2 * reg$passing_interceptions
reg$rush_pts <- 0.1 * reg$rushing_yards + 6 * reg$rushing_tds

sc <- as.data.frame(load_snap_counts(seasons = all_seasons))
sc <- sc[!is.na(sc$offense_pct), ]
snap_key <- paste(normalize_join_name(sc$player), sc$season, sc$week)
snap_lookup <- setNames(sc$offense_pct, snap_key)
reg_key <- paste(normalize_join_name(reg$player_display_name), reg$season, reg$week)
reg$snap_pct <- unname(snap_lookup[reg_key])

reg_unfiltered <- reg[order(reg$player_display_name, reg$season, reg$week), ]
reg_filtered <- reg_unfiltered[is.na(reg_unfiltered$snap_pct) | reg_unfiltered$snap_pct > MIN_SNAP_PCT, ]
cat("Unfiltered rows:", nrow(reg_unfiltered), " Filtered rows:", nrow(reg_filtered),
    " (", round(100 * (1 - nrow(reg_filtered) / nrow(reg_unfiltered)), 1), "% removed)\n\n")

# ---- Part 1: re-sweep MED_DECAY per position on FILTERED data ----
build_eval_points <- function(dataset, min_hist) {
  pts <- list(); i <- 0
  for (p in unique(dataset$player_display_name)) {
    d <- dataset[dataset$player_display_name == p, ]
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

new_med_decay <- c()
for (pos in c("QB", "RB", "WR", "TE")) {
  cat("=== MED_DECAY sweep,", pos, "(filtered data) ===\n")
  dpos <- reg_filtered[reg_filtered$position == pos, ]
  pts <- build_eval_points(dpos, MIN_HIST_GAMES)
  scores <- sapply(DECAY_GRID, function(dc) {
    mean(sapply(pts, function(e) {
      w <- recency_weights(nrow(e$hist), dc)
      abs(e$actual$fantasy_points_ppr - weighted_quantile(e$hist$fantasy_points_ppr, w, 0.50))
    }))
  })
  names(scores) <- DECAY_GRID
  print(round(scores, 4))
  best <- DECAY_GRID[which.min(scores)]
  new_med_decay[pos] <- best
  cat("Best:", best, " (old:", OLD_MED_DECAY[pos], ") MAE at best:", round(min(scores), 4), "\n\n")
}

# ---- Part 2: head-to-head, new decay+filtered vs old decay+unfiltered ----
cat("=== Head-to-head: NEW decay + FILTERED data vs. OLD decay + UNFILTERED data ===\n")
for (pos in c("QB", "RB", "WR", "TE")) {
  dpos_f <- reg_filtered[reg_filtered$position == pos, ]
  dpos_u <- reg_unfiltered[reg_unfiltered$position == pos, ]
  pts_f <- build_eval_points(dpos_f, MIN_HIST_GAMES)
  pts_u <- build_eval_points(dpos_u, MIN_HIST_GAMES)

  score_f <- mean(sapply(pts_f, function(e) {
    w <- recency_weights(nrow(e$hist), new_med_decay[pos])
    abs(e$actual$fantasy_points_ppr - weighted_quantile(e$hist$fantasy_points_ppr, w, 0.50))
  }))
  score_u <- mean(sapply(pts_u, function(e) {
    w <- recency_weights(nrow(e$hist), OLD_MED_DECAY[pos])
    abs(e$actual$fantasy_points_ppr - weighted_quantile(e$hist$fantasy_points_ppr, w, 0.50))
  }))
  cat(sprintf("%s  old(unfiltered,d=%.2f) MAE=%.4f  new(filtered,d=%.2f) MAE=%.4f  change=%+.2f%%\n",
              pos, OLD_MED_DECAY[pos], score_u, new_med_decay[pos], score_f,
              100 * (score_f - score_u) / score_u))
}

# ---- Part 3: re-sweep QB pass/rush split decays on FILTERED data ----
cat("\n=== QB pass/rush split re-sweep (filtered data) ===\n")
qb_f <- reg_filtered[reg_filtered$position == "QB", ]
pts_qb <- build_eval_points(qb_f, MIN_HIST_GAMES)

score_component <- function(col, decay) {
  mean(sapply(pts_qb, function(e) {
    w <- recency_weights(nrow(e$hist), decay)
    abs(e$actual[[col]] - sum(e$hist[[col]] * w) / sum(w))
  }))
}
pass_scores <- sapply(DECAY_GRID, function(dc) score_component("pass_pts", dc))
rush_scores <- sapply(DECAY_GRID, function(dc) score_component("rush_pts", dc))
names(pass_scores) <- DECAY_GRID; names(rush_scores) <- DECAY_GRID
cat("pass_pts:\n"); print(round(pass_scores, 4))
cat("rush_pts:\n"); print(round(rush_scores, 4))
new_pass_decay <- DECAY_GRID[which.min(pass_scores)]
new_rush_decay <- DECAY_GRID[which.min(rush_scores)]
cat("Best pass decay:", new_pass_decay, "(old:", OLD_PASS_DECAY, ")\n")
cat("Best rush decay:", new_rush_decay, "(old:", OLD_RUSH_DECAY, ")\n\n")

set.seed(42)
score_split_quantile <- function(pass_decay, rush_decay, n_sims = 3000) {
  mean(sapply(pts_qb, function(e) {
    n <- nrow(e$hist)
    w_pass <- recency_weights(n, pass_decay)
    w_rush <- recency_weights(n, rush_decay)
    sim <- sample(e$hist$pass_pts, n_sims, replace = TRUE, prob = w_pass) +
      sample(e$hist$rush_pts, n_sims, replace = TRUE, prob = w_rush)
    abs(e$actual$fantasy_points_ppr - as.numeric(quantile(sim, 0.50)))
  }))
}
new_split_mae <- score_split_quantile(new_pass_decay, new_rush_decay)
old_split_on_filtered_mae <- score_split_quantile(OLD_PASS_DECAY, OLD_RUSH_DECAY)
cat(sprintf("QB split, filtered data: old decays MAE=%.4f  new decays MAE=%.4f  change=%+.2f%%\n",
            old_split_on_filtered_mae, new_split_mae,
            100 * (new_split_mae - old_split_on_filtered_mae) / old_split_on_filtered_mae))
