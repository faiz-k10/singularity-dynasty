# Backtest: does splitting QB's weekly median into separately-decayed
# passing-points and rushing-points components (summed) predict the next
# game more accurately than the current single blended decay
# (MED_DECAY["QB"] = 0.90) applied directly to the combined
# fantasy_points_ppr column?
#
# Motivation: README.md's own words -- "QB's ceiling decay barely matters
# (<1% improvement, nearly flat backtest curve) ... don't over-trust
# QB=0.98 as precisely correct." QB is the one position where the
# existing single-decay backtest has the least confidence it found a real
# optimum. QB fantasy output is also unusually bimodal (a pure passer vs.
# a real rushing threat) in a way no other position's blended total is --
# passing and rushing points may simply want different amounts of
# recency weighting, the same insight that already justified splitting
# TD/INT from yardage for season totals (backtest_stat_group_decay.R).
#
# Method, walk-forward, zero lookahead, same style as MED_DECAY's
# original backtest ("for each player, at each point in their history,
# predict the next game using only games before it"):
#   1. Sweep a decay grid independently for pass_pts and rush_pts
#      (standard scoring: 0.04/yard + 4/TD - 2/INT passing;
#      0.1/yard + 6/TD rushing -- same constants
#      web/scripts/check-projection-math.mjs already treats as ground
#      truth), scored by predicting next-game value via weighted MEAN,
#      MAE against the real next game -- same scoring style as
#      backtest_usage_metric_decay.R (WOPR/EPA), which is also a
#      point-estimate (not quantile) prediction target.
#   2. With each component's own best decay locked in, compare SUMMED
#      (pass_pts_pred + rush_pts_pred) against the CURRENT approach
#      (single MED_DECAY=0.90 weighted mean of the blended
#      fantasy_points_ppr column) -- both scored the same way, on the
#      same games, so the comparison is apples to apples.
#
# Run: Rscript backtest_qb_pass_rush_split.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 8
DECAY_GRID <- seq(0.70, 0.99, by = 0.03)
CURRENT_MED_DECAY_QB <- 0.90

recency_weights <- function(n, d) {
  w <- d ^ ((n - 1):0)
  w / sum(w)
}
weighted_mean <- function(x, w) sum(x * w) / sum(w)

cat("Loading nflreadr data...\n")
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
qb <- raw[raw$season_type == "REG" & raw$position == "QB",
          c("player_display_name", "season", "week", "passing_yards", "passing_tds",
            "passing_interceptions", "rushing_yards", "rushing_tds", "fantasy_points_ppr")]
qb <- qb[!(qb$week %in% EXCLUDE_WEEKS), ]
qb <- qb[!is.na(qb$fantasy_points_ppr), ]
for (col in c("passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds")) {
  qb[[col]][is.na(qb[[col]])] <- 0
}
qb$pass_pts <- 0.04 * qb$passing_yards + 4 * qb$passing_tds - 2 * qb$passing_interceptions
qb$rush_pts <- 0.1 * qb$rushing_yards + 6 * qb$rushing_tds
qb <- qb[order(qb$player_display_name, qb$season, qb$week), ]
cat("Loaded", nrow(qb), "QB player-game rows.\n\n")

# Build, once, every walk-forward (player, game-index) evaluation point
# that will be scored under every candidate decay -- this doesn't depend
# on decay, so it's built once and reused across the whole sweep instead
# of re-filtering per candidate.
players <- unique(qb$player_display_name)
eval_points <- list()
ep_i <- 0
for (p in players) {
  d <- qb[qb$player_display_name == p, ]
  n <- nrow(d)
  if (n < MIN_HIST_GAMES + 1) next
  for (i in (MIN_HIST_GAMES + 1):n) {
    if (!(d$season[i] %in% TEST_SEASONS)) next
    ep_i <- ep_i + 1
    eval_points[[ep_i]] <- list(hist = d[1:(i - 1), ], actual_row = d[i, ])
  }
}
cat("Built", length(eval_points), "walk-forward evaluation points.\n\n")

score_component <- function(col, decay) {
  err <- numeric(length(eval_points))
  for (i in seq_along(eval_points)) {
    h <- eval_points[[i]]$hist
    w <- recency_weights(nrow(h), decay)
    pred <- weighted_mean(h[[col]], w)
    err[i] <- abs(eval_points[[i]]$actual_row[[col]] - pred)
  }
  mean(err)
}

cat("=== Sweeping pass_pts decay ===\n")
pass_scores <- sapply(DECAY_GRID, function(dc) score_component("pass_pts", dc))
names(pass_scores) <- DECAY_GRID
print(round(pass_scores, 4))
best_pass_decay <- DECAY_GRID[which.min(pass_scores)]
cat("Best pass_pts decay:", best_pass_decay, " (MAE", round(min(pass_scores), 3), ")\n\n")

cat("=== Sweeping rush_pts decay ===\n")
rush_scores <- sapply(DECAY_GRID, function(dc) score_component("rush_pts", dc))
names(rush_scores) <- DECAY_GRID
print(round(rush_scores, 4))
best_rush_decay <- DECAY_GRID[which.min(rush_scores)]
cat("Best rush_pts decay:", best_rush_decay, " (MAE", round(min(rush_scores), 3), ")\n\n")

cat("=== Head-to-head: split (own decays, summed) vs. current blended MED_DECAY=0.90 ===\n")
split_err <- numeric(length(eval_points))
current_err <- numeric(length(eval_points))
for (i in seq_along(eval_points)) {
  h <- eval_points[[i]]$hist
  n <- nrow(h)
  w_pass <- recency_weights(n, best_pass_decay)
  w_rush <- recency_weights(n, best_rush_decay)
  pred_split <- weighted_mean(h$pass_pts, w_pass) + weighted_mean(h$rush_pts, w_rush)

  w_blend <- recency_weights(n, CURRENT_MED_DECAY_QB)
  pred_current <- weighted_mean(h$fantasy_points_ppr, w_blend)

  actual <- eval_points[[i]]$actual_row$fantasy_points_ppr
  split_err[i] <- abs(actual - pred_split)
  current_err[i] <- abs(actual - pred_current)
}
cat(sprintf("n=%d\ncurrent (blended, decay=%.2f) MAE: %.4f\nsplit (pass=%.2f, rush=%.2f) MAE: %.4f\nchange: %+.2f%%\n",
            length(eval_points), CURRENT_MED_DECAY_QB, mean(current_err),
            best_pass_decay, best_rush_decay, mean(split_err),
            100 * (mean(split_err) - mean(current_err)) / mean(current_err)))
