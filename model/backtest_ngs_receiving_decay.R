# Backtest: recency-decay for Avg Separation / YAC Above Expectation
# (WR/TE only), scored the same way backtest_stat_group_decay.R scores
# the granular stat_ranges columns -- walk-forward folds, bootstrap a
# season using only data before target season Y, pinball loss on the
# resulting floor/median/ceiling against Y's REAL realized value.
#
# Unlike backtest_stat_group_decay.R's counting stats (yards, TDs --
# summed across a season), avg_separation/yac_above_exp are RATE stats
# (a per-catch average). A simulated "season total" doesn't make sense
# for a rate -- instead each bootstrap draw resamples g games (same
# Binomial(16, availability) games-played model as production) and takes
# the MEAN of the resampled games' values as one simulated season-average
# draw. g=0 draws are skipped (a player who didn't suit up doesn't
# contribute an average of zero, that's just not an observation).
#
# Run: Rscript backtest_ngs_receiving_decay.R

suppressMessages(library(nflreadr))

MAX_GAMES_PER_SEASON <- 16
METRICS <- c("avg_separation", "avg_yac_above_expectation")
POSITIONS <- c("WR", "TE")

TEST_SEASONS   <- 2022:2025   # walk-forward folds -- each uses only the 3 seasons before it
LOOKBACK_YEARS <- 3
DECAY_GRID     <- seq(0.70, 0.97, by = 0.03)
N_SIMS         <- 4000
MIN_HIST_GAMES <- 8   # matches backtest_stat_group_decay.R's validated eligibility floor

cat("Loading NGS receiving data for seasons", min(TEST_SEASONS) - LOOKBACK_YEARS, "-", max(TEST_SEASONS), "...\n")
ALL_SEASONS <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_nextgen_stats(stat_type = "receiving", seasons = ALL_SEASONS))
# week == 0 is NGS's own season-aggregate row, not a per-game one -- this
# backtest needs the real per-game log to resample from, same as every
# other stat's game log.
reg_all <- raw[raw$season_type == "REG" & raw$week != 0,
               c("player_gsis_id", "player_display_name", "player_position",
                 "season", "week", METRICS)]
names(reg_all)[names(reg_all) == "player_position"] <- "position"
reg_all <- reg_all[reg_all$position %in% POSITIONS, ]
cat("Loaded", nrow(reg_all), "player-game rows.\n\n")

recency_weights <- function(n_games, decay) {
  w <- decay ^ ((n_games - 1):0)
  w / sum(w)
}

# Same shape as projection_engine.R's player_availability(), simplified
# for a fully-historical backtest context (no in-progress target season).
player_availability <- function(player_games_df, hist_seasons) {
  a_by_yr <- sapply(hist_seasons, function(s) {
    min(sum(player_games_df$season == s) / MAX_GAMES_PER_SEASON, 1)
  })
  yw <- 0.6 ^ ((length(hist_seasons) - 1):0)  # matches AVAILABILITY_YEAR_DECAY elsewhere
  yw <- yw / sum(yw)
  min(sum(a_by_yr * yw), 1)
}

pinball <- function(actual, pred, q) {
  ifelse(actual >= pred, q * (actual - pred), (1 - q) * (pred - actual))
}

# Vectorized: draws N_SIMS simulated season-AVERAGES (not totals) for one
# metric. g ~ Binomial(16, avail) games played; draws with g == 0 produce
# NA (no observation, dropped from the quantile calc below) instead of a
# misleading 0.
simulate_season_means <- function(game_log, metric, decay, avail, n_sims) {
  n <- nrow(game_log)
  idx <- seq_len(n)
  w <- recency_weights(n, decay)
  g_draws <- rbinom(n_sims, MAX_GAMES_PER_SEASON, avail)

  out <- rep(NA_real_, n_sims)
  g_vals <- sort(unique(g_draws[g_draws > 0]))
  for (g in g_vals) {
    which_draws <- which(g_draws == g)
    cnt <- length(which_draws)
    sampled <- sample(idx, g * cnt, replace = TRUE, prob = w)
    sampled_mat <- matrix(game_log[[metric]][sampled], nrow = g, ncol = cnt)
    out[which_draws] <- colMeans(sampled_mat)
  }
  out
}

positions <- POSITIONS
results <- list()

for (pos in positions) {
  for (metric in METRICS) {
    cat("=== ", pos, "/", metric, " ===\n", sep = "")

    fold_data <- list()
    for (Y in TEST_SEASONS) {
      hist_seasons <- (Y - LOOKBACK_YEARS):(Y - 1)
      hist <- reg_all[reg_all$season %in% hist_seasons & reg_all$position == pos, ]
      actual <- reg_all[reg_all$season == Y & reg_all$position == pos, ]

      counts <- table(hist$player_display_name)
      players <- names(counts[counts >= MIN_HIST_GAMES])

      player_logs <- list()
      player_avail <- list()
      player_actual <- list()
      for (p in players) {
        d <- hist[hist$player_display_name == p, ]
        d <- d[order(d$season, d$week), ]
        player_logs[[p]] <- d
        player_avail[[p]] <- player_availability(d, hist_seasons)
        a <- actual[actual$player_display_name == p, ]
        # Real target: the player's own actual season-average that year.
        # Dropped from this fold's evaluation if they didn't play at all
        # (no real average to score against), same reasoning as
        # backtest_usage_metric_decay.R.
        if (nrow(a) > 0) player_actual[[p]] <- mean(a[[metric]], na.rm = TRUE)
      }
      eval_players <- intersect(players, names(player_actual))
      fold_data[[as.character(Y)]] <- list(players = eval_players, logs = player_logs,
                                            avail = player_avail, actual = player_actual)
      cat("  ", Y, ": ", length(eval_players), " evaluable players (history ", min(hist_seasons), "-", max(hist_seasons), ")\n", sep = "")
    }

    loss_by_decay <- numeric(length(DECAY_GRID))
    names(loss_by_decay) <- as.character(DECAY_GRID)
    coverage_by_decay <- list()

    for (di in seq_along(DECAY_GRID)) {
      decay <- DECAY_GRID[di]
      set.seed(42)
      total_loss <- 0
      n_obs <- 0
      below_floor <- 0
      above_ceiling <- 0
      n_calib <- 0

      for (Y in as.character(TEST_SEASONS)) {
        fd <- fold_data[[Y]]
        for (p in fd$players) {
          sim <- simulate_season_means(fd$logs[[p]], metric, decay, fd$avail[[p]], N_SIMS)
          sim <- sim[!is.na(sim)]
          if (length(sim) < 100) next  # too few valid draws (very low availability) to trust the quantiles

          fl <- as.numeric(quantile(sim, 0.10))
          md <- as.numeric(quantile(sim, 0.50))
          ce <- as.numeric(quantile(sim, 0.90))
          a <- fd$actual[[p]]

          total_loss <- total_loss + pinball(a, fl, 0.10) + pinball(a, md, 0.50) + pinball(a, ce, 0.90)
          n_obs <- n_obs + 3
          below_floor <- below_floor + (a < fl)
          above_ceiling <- above_ceiling + (a > ce)
          n_calib <- n_calib + 1
        }
      }
      loss_by_decay[di] <- total_loss / n_obs
      coverage_by_decay[[di]] <- c(below_floor_pct = round(100 * below_floor / n_calib, 1),
                                    above_ceiling_pct = round(100 * above_ceiling / n_calib, 1))
      cat("  decay=", decay, " avg pinball loss=", round(loss_by_decay[di], 5),
          " | below-floor%=", coverage_by_decay[[di]]["below_floor_pct"],
          " above-ceiling%=", coverage_by_decay[[di]]["above_ceiling_pct"], "\n", sep = "")
    }

    best_idx <- which.min(loss_by_decay)
    cat("  -> BEST decay for ", pos, "/", metric, ": ", DECAY_GRID[best_idx],
        " (loss=", round(loss_by_decay[best_idx], 5), ", target below/above-floor ~10%/~10%)\n\n", sep = "")

    results[[paste(pos, metric, sep = "_")]] <- list(
      loss_by_decay = loss_by_decay,
      coverage_by_decay = coverage_by_decay,
      best_decay = DECAY_GRID[best_idx]
    )
  }
}

cat("\n\n=========== SUMMARY ===========\n")
cat(sprintf("%-6s %-28s %-10s\n", "Pos", "Metric", "BestDecay"))
for (nm in names(results)) {
  parts <- strsplit(nm, "_")[[1]]
  pos <- parts[1]
  metric <- paste(parts[-1], collapse = "_")
  cat(sprintf("%-6s %-28s %-10s\n", pos, metric, results[[nm]]$best_decay))
}

saveRDS(results, "backtest_ngs_receiving_decay_results.rds")
cat("\nFull results saved to backtest_ngs_receiving_decay_results.rds\n")
