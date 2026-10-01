# Backtest: does a player's own history of EXPECTED touchdowns
# (nflreadr::load_ff_opportunity()'s rush_touchdown_exp/rec_touchdown_exp/
# pass_touchdown_exp -- a play-by-play usage model: yard-line, down/
# distance, target depth, NOT just a raw historical count) predict next-
# game real TD counts better than the current approach, a recency-weighted
# mean of raw historical TD counts (STAT_GROUP_DECAY$td_int in
# projection_engine.R)?
#
# Rationale: raw TD counts are lumpy -- most games are 0 even for a real
# red-zone threat, which is exactly why td_int already uses the slowest
# decay in the whole model (0.94-0.97, see projection_engine.R's own
# comment on STAT_GROUP_DECAY). touchdown_exp is smoothed at the PLAY
# level instead of the GAME level (a player's usage that game maps to a
# fractional expected-TD value even on games he scored 0), so it should
# carry a cleaner signal and may need much less game-to-game averaging to
# be trustworthy -- same data source already powers this site's /my-team
# xFP feature (exp_points_ppr), joined the same way (player_id, which is
# GSIS in both load_player_stats() and load_ff_opportunity()).
#
# Method: for each position/stat, walk-forward next-game eval (2022-2025,
# 3-year lookback, week 18 excluded -- same discipline as every other
# backtest in this file), comparing:
#   RAW   -- weighted mean of the player's own historical raw TD counts
#            (current approach), own decay swept.
#   EXP   -- weighted mean of the player's own historical touchdown_exp,
#            own decay swept independently (expected to want much less
#            aggressive decay, since the signal itself is already
#            play-level smoothed).
#   BLEND -- alpha * RAW(best decay) + (1-alpha) * EXP(best decay), alpha
#            swept 0-1, to check whether combining beats either alone.
# Scored via MAE against the real next-game TD count.
#
# Run: Rscript backtest_td_predictor.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 6   # matches projection_engine.R's MIN_GAMES eligibility floor
DECAY_GRID <- seq(0.60, 0.97, by = 0.03)
ALPHA_GRID <- seq(0, 1, by = 0.1)

STATS_BY_POS <- list(
  QB = list(passing_tds = "pass_touchdown_exp"),
  RB = list(rushing_tds = "rush_touchdown_exp", receiving_tds = "rec_touchdown_exp"),
  WR = list(receiving_tds = "rec_touchdown_exp"),
  TE = list(receiving_tds = "rec_touchdown_exp")
)
RAW_COL_TO_ACTUAL <- c(rushing_tds = "rushing_tds", receiving_tds = "receiving_tds", passing_tds = "passing_tds")

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_mean_w <- function(x, w) sum(x * w) / sum(w)

cat("Loading nflreadr player_stats...\n")
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw_stats <- as.data.frame(load_player_stats(seasons = all_seasons))
stats <- raw_stats[raw_stats$season_type == "REG",
                    c("player_id", "player_display_name", "position", "season", "week",
                      "rushing_tds", "receiving_tds", "passing_tds")]
stats <- stats[stats$position %in% c("QB", "RB", "WR", "TE"), ]
stats <- stats[!(stats$week %in% EXCLUDE_WEEKS), ]
for (col in c("rushing_tds", "receiving_tds", "passing_tds")) stats[[col]][is.na(stats[[col]])] <- 0
cat("Loaded", nrow(stats), "player-game rows.\n")

cat("Loading nflreadr ff_opportunity (expected TDs)...\n")
opp_list <- lapply(all_seasons, function(s) {
  tryCatch(as.data.frame(load_ff_opportunity(seasons = s, stat_type = "weekly")),
           error = function(e) NULL)
})
opp <- do.call(rbind, opp_list[!sapply(opp_list, is.null)])
opp <- opp[, c("player_id", "season", "week", "rush_touchdown_exp", "rec_touchdown_exp", "pass_touchdown_exp")]
for (col in c("rush_touchdown_exp", "rec_touchdown_exp", "pass_touchdown_exp")) opp[[col]][is.na(opp[[col]])] <- 0
cat("Loaded", nrow(opp), "ff_opportunity player-game rows.\n\n")

d_all <- merge(stats, opp, by = c("player_id", "season", "week"), all.x = TRUE)
for (col in c("rush_touchdown_exp", "rec_touchdown_exp", "pass_touchdown_exp")) d_all[[col]][is.na(d_all[[col]])] <- 0
d_all <- d_all[order(d_all$player_id, d_all$season, d_all$week), ]
cat("Merged rows:", nrow(d_all), " (unmatched-to-opportunity games get exp=0, same as a real 0-usage game)\n\n")

# Same range-agnostic eval-point builder as the other backtests: one row
# per (player, game k) with min_hist+ games of real history before it,
# game k's season inside TEST_SEASONS.
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

sweep_raw <- function(pts, col) {
  sapply(DECAY_GRID, function(dc) {
    mean(sapply(pts, function(e) {
      w <- recency_weights(nrow(e$hist), dc)
      abs(e$actual[[col]] - weighted_mean_w(e$hist[[col]], w))
    }))
  })
}
sweep_exp <- function(pts, col, exp_col) {
  sapply(DECAY_GRID, function(dc) {
    mean(sapply(pts, function(e) {
      w <- recency_weights(nrow(e$hist), dc)
      abs(e$actual[[col]] - weighted_mean_w(e$hist[[exp_col]], w))
    }))
  })
}

results <- list()

for (pos in names(STATS_BY_POS)) {
  dpos <- d_all[d_all$position == pos, ]
  pts <- build_eval_points(dpos, MIN_HIST_GAMES)
  cat("===", pos, "=== eval points:", length(pts), "===\n")

  for (col in names(STATS_BY_POS[[pos]])) {
    exp_col <- STATS_BY_POS[[pos]][[col]]
    cat("  --", col, "(exp col:", exp_col, ") --\n")

    raw_scores <- sweep_raw(pts, col)
    exp_scores <- sweep_exp(pts, col, exp_col)
    best_raw_decay <- DECAY_GRID[which.min(raw_scores)]
    best_exp_decay <- DECAY_GRID[which.min(exp_scores)]
    best_raw_mae <- min(raw_scores)
    best_exp_mae <- min(exp_scores)

    # Blend at each point using each component's own best decay.
    w_raw_list <- lapply(pts, function(e) recency_weights(nrow(e$hist), best_raw_decay))
    w_exp_list <- lapply(pts, function(e) recency_weights(nrow(e$hist), best_exp_decay))
    pred_raw <- mapply(function(e, w) weighted_mean_w(e$hist[[col]], w), pts, w_raw_list)
    pred_exp <- mapply(function(e, w) weighted_mean_w(e$hist[[exp_col]], w), pts, w_exp_list)
    actual <- sapply(pts, function(e) e$actual[[col]])

    blend_scores <- sapply(ALPHA_GRID, function(a) mean(abs(actual - (a * pred_raw + (1 - a) * pred_exp))))
    best_alpha <- ALPHA_GRID[which.min(blend_scores)]
    best_blend_mae <- min(blend_scores)

    cat(sprintf("    RAW-only:   best decay=%.2f  MAE=%.4f\n", best_raw_decay, best_raw_mae))
    cat(sprintf("    EXP-only:   best decay=%.2f  MAE=%.4f  (%+.2f%% vs RAW)\n",
                best_exp_decay, best_exp_mae, 100 * (best_exp_mae - best_raw_mae) / best_raw_mae))
    cat(sprintf("    BLEND:      best alpha=%.1f (1=all-RAW, 0=all-EXP)  MAE=%.4f  (%+.2f%% vs RAW)\n\n",
                best_alpha, best_blend_mae, 100 * (best_blend_mae - best_raw_mae) / best_raw_mae))

    results[[paste(pos, col, sep = "_")]] <- list(
      n = length(pts), best_raw_decay = best_raw_decay, best_raw_mae = best_raw_mae,
      best_exp_decay = best_exp_decay, best_exp_mae = best_exp_mae,
      best_alpha = best_alpha, best_blend_mae = best_blend_mae
    )
  }
}

cat("\n\n=========== SUMMARY (MAE, lower is better) ===========\n")
cat(sprintf("%-4s %-16s %-8s %-10s %-10s %-10s\n", "Pos", "Stat", "N", "RAW", "EXP", "BLEND(best-alpha)"))
for (nm in names(results)) {
  r <- results[[nm]]
  parts <- strsplit(nm, "_")[[1]]
  pos <- parts[1]; stat <- paste(parts[-1], collapse = "_")
  cat(sprintf("%-4s %-16s %-8d %-10.4f %-10.4f %-10.4f (alpha=%.1f)\n",
              pos, stat, r$n, r$best_raw_mae, r$best_exp_mae, r$best_blend_mae, r$best_alpha))
}

saveRDS(results, "backtest_td_predictor_results.rds")
cat("\nFull results saved to backtest_td_predictor_results.rds\n")
