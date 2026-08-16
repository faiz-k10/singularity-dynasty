# Backtest: does "percentile rank of a player's real cumulative points
# through their first N games, within a simulated distribution of N-game
# sums drawn from their own pre-season weighted history" actually predict
# reversion over the REST of that season -- i.e. does a hot start (high
# percentile) predict a real decline afterward, and a cold start (low
# percentile) predict a real rebound? And does that beat the naive
# alternative of just comparing raw current PPG to the preseason
# projected PPG, with no simulation involved?
#
# Method: for each of 4 real, fully-completed seasons (2022-2025) as
# independent test folds, using ONLY the 3 prior seasons as history
# (same lookback as the rest of this engine):
#   1. Simulate N=3 games games, drawn with replacement (recency-weighted,
#      same MED_DECAY as everywhere else) from the player's own
#      pre-season history, 4000 times -- get the distribution of
#      "what a normal 3-game stretch for this player sums to."
#   2. Find the percentile rank of their REAL 3-game total within that
#      simulated distribution.
#   3. Compute reversion = (their real first-3-games PPG) - (their real
#      rest-of-season PPG). Positive means they cooled off, negative
#      means they got hotter.
#   4. Correlate percentile vs. reversion (expect POSITIVE: higher
#      percentile => bigger cooldown) and compare against the naive
#      predictor: raw_gap = first-3-games PPG - preseason projected PPG
#      (median season sim / games), with no simulation involved.
#
# Run: Rscript backtest_regression_metric.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
N_EARLY_GAMES <- 3
N_SIMS <- 4000
MIN_HIST_GAMES <- 8
MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
GAMES_PER_SEASON <- 17

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }

cat("Loading nflreadr data...\n")
ALL_SEASONS <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = ALL_SEASONS))
reg <- raw[raw$season_type == "REG",
           c("player_display_name", "position", "season", "week", "fantasy_points_ppr")]
reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
reg <- reg[!is.na(reg$fantasy_points_ppr), ]
cat("Loaded", nrow(reg), "player-game rows.\n\n")

results <- data.frame()

for (Y in TEST_SEASONS) {
  hist_seasons <- (Y - LOOKBACK_YEARS):(Y - 1)
  hist <- reg[reg$season %in% hist_seasons, ]
  season_y <- reg[reg$season == Y, ]
  season_y <- season_y[order(season_y$player_display_name, season_y$week), ]

  counts <- table(hist$player_display_name)
  eligible <- names(counts[counts >= MIN_HIST_GAMES])

  for (p in eligible) {
    d <- season_y[season_y$player_display_name == p, ]
    if (nrow(d) <= N_EARLY_GAMES) next  # need real games AFTER the early window too

    pos <- hist$position[hist$player_display_name == p][1]
    h <- hist[hist$player_display_name == p, ]
    n_hist <- nrow(h)
    w <- recency_weights(n_hist, MED_DECAY[[pos]])

    # Simulated distribution of a normal N_EARLY_GAMES-game stretch.
    sim_sums <- replicate(N_SIMS, sum(sample(h$fantasy_points_ppr, N_EARLY_GAMES, replace = TRUE, prob = w)))

    real_first_n <- sum(d$fantasy_points_ppr[1:N_EARLY_GAMES])
    percentile <- mean(sim_sums <= real_first_n)

    rest <- d$fantasy_points_ppr[(N_EARLY_GAMES + 1):nrow(d)]
    if (length(rest) == 0) next

    first_n_ppg <- real_first_n / N_EARLY_GAMES
    rest_ppg <- mean(rest)
    reversion <- first_n_ppg - rest_ppg

    # Naive baseline: preseason projected PPG = the player's OWN
    # weighted-mean per-game rate from history (same weighted_mean logic
    # as the rest of this engine would use for a season median, simplified
    # to a mean here since we just need a single point estimate, not a
    # full quantile).
    preseason_ppg <- sum(h$fantasy_points_ppr * w)
    raw_gap <- first_n_ppg - preseason_ppg

    results <- rbind(results, data.frame(
      season = Y, player = p, position = pos, n_hist = n_hist,
      percentile = percentile, reversion = reversion, raw_gap = raw_gap
    ))
  }
  cat("Season", Y, ": processed", sum(results$season == Y), "players\n")
}

cat("\nTotal player-seasons:", nrow(results), "\n\n")

cat("=== Correlation with reversion (positive = predictor correctly signals cooldown for hot starts) ===\n")
cat("percentile vs reversion: r =", round(cor(results$percentile, results$reversion), 4), "\n")
cat("raw_gap    vs reversion: r =", round(cor(results$raw_gap, results$reversion), 4), "\n\n")

cat("=== By position ===\n")
for (pos in c("QB", "RB", "WR", "TE")) {
  sub <- results[results$position == pos, ]
  cat(sprintf("%-3s  n=%-4d  percentile r=%.4f   raw_gap r=%.4f\n", pos, nrow(sub),
      cor(sub$percentile, sub$reversion), cor(sub$raw_gap, sub$reversion)))
}

cat("\n=== Decile check: mean reversion by percentile decile (monotonic increase = well-behaved) ===\n")
results$decile <- cut(results$percentile, breaks = seq(0, 1, 0.1), include.lowest = TRUE, labels = FALSE)
agg <- aggregate(reversion ~ decile, data = results, FUN = mean)
print(agg)

saveRDS(results, "backtest_regression_metric_results.rds")
cat("\nFull results saved to backtest_regression_metric_results.rds\n")
