# Extension of backtest_ngs_receiving_decay.R: given the decay already
# selected per (position, metric), find which INTERNAL quantile to query
# the simulated season-average distribution at so the empirical
# floor/ceiling actually exceed ~10% of the time out-of-sample -- same
# calibration concept as calibrate_stat_group_quantiles.R, applied to
# avg_separation/avg_yac_above_expectation's season-AVERAGE bootstrap
# (mean of resampled games, not a sum) instead of a season-total one.
#
# Run: Rscript calibrate_ngs_receiving_quantiles.R
# (expects backtest_ngs_receiving_decay_results.rds from the prior script)

suppressMessages(library(nflreadr))

MAX_GAMES_PER_SEASON <- 16
METRICS <- c("avg_separation", "avg_yac_above_expectation")
POSITIONS <- c("WR", "TE")

TEST_SEASONS   <- 2022:2025
LOOKBACK_YEARS <- 3
N_SIMS <- 4000
MIN_HIST_GAMES <- 8

prior <- readRDS("backtest_ngs_receiving_decay_results.rds")
best_decay <- sapply(prior, function(x) x$best_decay)
cat("Loaded best decay per (position, metric) from prior backtest:\n")
print(best_decay)
cat("\n")

FLOOR_Q_GRID <- sort(unique(c(seq(0.0005, 0.02, by = 0.0005), seq(0.02, 0.25, by = 0.01))))
CEIL_Q_GRID  <- sort(unique(c(seq(0.75, 0.99, by = 0.01), seq(0.99, 0.9995, by = 0.0005))))

cat("Loading NGS receiving data for seasons", min(TEST_SEASONS) - LOOKBACK_YEARS, "-", max(TEST_SEASONS), "...\n")
ALL_SEASONS <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_nextgen_stats(stat_type = "receiving", seasons = ALL_SEASONS))
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

player_availability <- function(player_games_df, hist_seasons) {
  a_by_yr <- sapply(hist_seasons, function(s) {
    min(sum(player_games_df$season == s) / MAX_GAMES_PER_SEASON, 1)
  })
  yw <- 0.6 ^ ((length(hist_seasons) - 1):0)
  yw <- yw / sum(yw)
  min(sum(a_by_yr * yw), 1)
}

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

calib_results <- list()

for (pos in POSITIONS) {
  for (metric in METRICS) {
    key <- paste(pos, metric, sep = "_")
    decay <- best_decay[[key]]

    cat("=== ", pos, "/", metric, " (decay=", decay, ") ===\n", sep = "")

    below_floor_count <- setNames(numeric(length(FLOOR_Q_GRID)), as.character(FLOOR_Q_GRID))
    above_ceil_count  <- setNames(numeric(length(CEIL_Q_GRID)), as.character(CEIL_Q_GRID))
    n_total <- 0

    set.seed(42)
    for (Y in TEST_SEASONS) {
      hist_seasons <- (Y - LOOKBACK_YEARS):(Y - 1)
      hist <- reg_all[reg_all$season %in% hist_seasons & reg_all$position == pos, ]
      actual <- reg_all[reg_all$season == Y & reg_all$position == pos, ]
      counts <- table(hist$player_display_name)
      players <- names(counts[counts >= MIN_HIST_GAMES])

      for (p in players) {
        d <- hist[hist$player_display_name == p, ]
        d <- d[order(d$season, d$week), ]
        avail <- player_availability(d, hist_seasons)
        a_row <- actual[actual$player_display_name == p, ]
        if (nrow(a_row) == 0) next  # no real season-average to score against
        a <- mean(a_row[[metric]], na.rm = TRUE)

        sim <- simulate_season_means(d, metric, decay, avail, N_SIMS)
        sim <- sim[!is.na(sim)]
        if (length(sim) < 100) next

        n_total <- n_total + 1
        fl_candidates <- quantile(sim, FLOOR_Q_GRID)
        below_floor_count <- below_floor_count + as.numeric(a < fl_candidates)
        ce_candidates <- quantile(sim, CEIL_Q_GRID)
        above_ceil_count <- above_ceil_count + as.numeric(a > ce_candidates)
      }
    }

    floor_rate <- 100 * below_floor_count / n_total
    ceil_rate  <- 100 * above_ceil_count / n_total

    best_floor_q <- FLOOR_Q_GRID[which.min(abs(floor_rate - 10))]
    best_ceil_q  <- CEIL_Q_GRID[which.min(abs(ceil_rate - 10))]

    cat("  Floor calibration (target: 10% of actuals fall below):\n")
    for (i in seq_along(FLOOR_Q_GRID)) {
      marker <- if (FLOOR_Q_GRID[i] == best_floor_q) " <-- best" else ""
      cat(sprintf("    internal_q=%.4f -> %.1f%% below-floor%s\n", FLOOR_Q_GRID[i], floor_rate[i], marker))
    }
    cat("  Ceiling calibration (target: 10% of actuals exceed):\n")
    for (i in seq_along(CEIL_Q_GRID)) {
      marker <- if (CEIL_Q_GRID[i] == best_ceil_q) " <-- best" else ""
      cat(sprintf("    internal_q=%.4f -> %.1f%% above-ceiling%s\n", CEIL_Q_GRID[i], ceil_rate[i], marker))
    }
    cat("  -> CALIBRATED floor_q=", best_floor_q, " ceil_q=", best_ceil_q,
        " (n=", n_total, ")\n\n", sep = "")

    calib_results[[key]] <- list(decay = decay, floor_q = best_floor_q, ceil_q = best_ceil_q,
                                  floor_rate_at_best = floor_rate[as.character(best_floor_q)],
                                  ceil_rate_at_best = ceil_rate[as.character(best_ceil_q)])
  }
}

cat("\n\n=========== FINAL SUMMARY: decay + calibrated internal quantiles ===========\n")
cat(sprintf("%-6s %-28s %-8s %-10s %-10s\n", "Pos", "Metric", "Decay", "Floor_q", "Ceil_q"))
for (nm in names(calib_results)) {
  parts <- strsplit(nm, "_")[[1]]
  pos <- parts[1]
  metric <- paste(parts[-1], collapse = "_")
  r <- calib_results[[nm]]
  cat(sprintf("%-6s %-28s %-8s %-10s %-10s\n", pos, metric, r$decay, r$floor_q, r$ceil_q))
}

saveRDS(calib_results, "calibrate_ngs_receiving_quantiles_results.rds")
cat("\nSaved to calibrate_ngs_receiving_quantiles_results.rds\n")
