# Backtest: does WOPR/EPA need its own recency-decay rate per position,
# or is reusing MED_DECAY (tuned to predict next fantasy_points_ppr) good
# enough? Same walk-forward idea as backtest_stat_group_decay.R (which
# found touchdowns/interceptions need meaningfully different decay than
# yardage) -- this checks whether WOPR/EPA, as their own prediction
# targets, want a different decay than the blended fantasy-points total.
#
# Unlike backtest_stat_group_decay.R, WOPR/EPA are published as a single
# weighted-mean POINT ESTIMATE (like weekly_scoring_stats), not a
# floor/median/ceiling distribution -- so this scores plain prediction
# error (MAE) of "predicted season-ahead mean" vs. "real realized mean
# that season", not pinball loss against a bootstrapped distribution.
#
# Run: Rscript backtest_usage_metric_decay.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS  <- 2022:2025   # walk-forward folds -- each uses only the 3 seasons before it
LOOKBACK_YEARS <- 3
DECAY_GRID    <- seq(0.70, 0.97, by = 0.03)
MIN_HIST_GAMES <- 8   # matches backtest_stat_group_decay.R's validated eligibility floor

cat("Loading nflreadr data for seasons", min(TEST_SEASONS) - LOOKBACK_YEARS, "-", max(TEST_SEASONS), "...\n")
ALL_SEASONS <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = ALL_SEASONS))
reg_all <- raw[raw$season_type == "REG",
               c("player_id", "player_display_name", "position", "season", "week",
                 "wopr", "passing_epa", "rushing_epa", "receiving_epa")]
reg_all <- reg_all[reg_all$position %in% c("QB", "RB", "WR", "TE"), ]
reg_all <- reg_all[!(reg_all$week %in% EXCLUDE_WEEKS), ]
for (col in c("wopr", "passing_epa", "rushing_epa", "receiving_epa")) {
  reg_all[[col]][is.na(reg_all[[col]])] <- 0
}
# Same position-relevant combination projection_engine.R uses for `epa`.
reg_all$epa_component <- ifelse(reg_all$position == "QB", reg_all$passing_epa + reg_all$rushing_epa,
                          ifelse(reg_all$position == "RB", reg_all$rushing_epa + reg_all$receiving_epa,
                                 reg_all$receiving_epa))
cat("Loaded", nrow(reg_all), "player-game rows.\n\n")

recency_weights <- function(n_games, decay) {
  w <- decay ^ ((n_games - 1):0)
  w / sum(w)
}
weighted_mean <- function(x, w) sum(x * w) / sum(w)

# metrics_by_pos: which columns to backtest per position -- wopr skipped
# for QB (receiving usage only), matching production.
metrics_by_pos <- list(
  QB = c("epa_component"),
  RB = c("wopr", "epa_component"),
  WR = c("wopr", "epa_component"),
  TE = c("wopr", "epa_component")
)

positions <- c("QB", "RB", "WR", "TE")
results <- list()

for (pos in positions) {
  for (metric in metrics_by_pos[[pos]]) {
    cat("=== ", pos, "/", metric, " ===\n", sep = "")

    # Pre-build, per test season, the eligible player set + history game
    # log + real actual season-average -- doesn't depend on decay, so
    # computed once and reused across the whole decay grid.
    fold_data <- list()
    for (Y in TEST_SEASONS) {
      hist_seasons <- (Y - LOOKBACK_YEARS):(Y - 1)
      hist <- reg_all[reg_all$season %in% hist_seasons & reg_all$position == pos, ]
      actual <- reg_all[reg_all$season == Y & reg_all$position == pos, ]

      counts <- table(hist$player_display_name)
      players <- names(counts[counts >= MIN_HIST_GAMES])

      player_logs <- list()
      player_actual <- list()
      for (p in players) {
        d <- hist[hist$player_display_name == p, ]
        d <- d[order(d$season, d$week), ]
        player_logs[[p]] <- d
        a <- actual[actual$player_display_name == p, ]
        # Real target: the player's own actual average that season (what
        # a season-ahead point-estimate projection is trying to predict).
        # Players with no games that season (didn't play) are dropped
        # from THIS fold's evaluation -- 0 isn't a real usage/efficiency
        # reading, just an absence, and would swamp the loss with an
        # unrelated signal (availability, not usage/efficiency accuracy).
        if (nrow(a) > 0) player_actual[[p]] <- mean(a[[metric]])
      }
      eval_players <- names(player_actual)
      fold_data[[as.character(Y)]] <- list(players = eval_players, logs = player_logs,
                                            actual = player_actual)
      cat("  ", Y, ": ", length(eval_players), " evaluable players (history ", min(hist_seasons), "-", max(hist_seasons), ")\n", sep = "")
    }

    loss_by_decay <- numeric(length(DECAY_GRID))
    names(loss_by_decay) <- as.character(DECAY_GRID)

    for (di in seq_along(DECAY_GRID)) {
      decay <- DECAY_GRID[di]
      total_abs_err <- 0
      n_obs <- 0

      for (Y in as.character(TEST_SEASONS)) {
        fd <- fold_data[[Y]]
        for (p in fd$players) {
          d <- fd$logs[[p]]
          n <- nrow(d)
          w <- recency_weights(n, decay)
          pred <- weighted_mean(d[[metric]], w)
          actual <- fd$actual[[p]]
          total_abs_err <- total_abs_err + abs(actual - pred)
          n_obs <- n_obs + 1
        }
      }
      loss_by_decay[di] <- total_abs_err / n_obs
      cat("  decay=", decay, " MAE=", round(loss_by_decay[di], 4), "\n", sep = "")
    }

    best_idx <- which.min(loss_by_decay)
    cat("  -> BEST decay for ", pos, "/", metric, ": ", DECAY_GRID[best_idx],
        " (MAE=", round(loss_by_decay[best_idx], 4), ")\n\n", sep = "")

    results[[paste(pos, metric, sep = "_")]] <- list(
      loss_by_decay = loss_by_decay,
      best_decay = DECAY_GRID[best_idx]
    )
  }
}

cat("\n\n=========== SUMMARY ===========\n")
cat(sprintf("%-6s %-15s %-10s %-10s\n", "Pos", "Metric", "BestDecay", "MED_DECAY"))
med_decay_ref <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
for (nm in names(results)) {
  parts <- strsplit(nm, "_")[[1]]
  pos <- parts[1]
  metric <- paste(parts[-1], collapse = "_")
  cat(sprintf("%-6s %-15s %-10s %-10s\n", pos, metric, results[[nm]]$best_decay, med_decay_ref[[pos]]))
}

saveRDS(results, "backtest_usage_metric_decay_results.rds")
cat("\nFull results saved to backtest_usage_metric_decay_results.rds\n")
