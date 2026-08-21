# Extension of backtest_target_share_decay.R: given the decay already
# selected per position, find which INTERNAL quantile to query the
# simulated season-average distribution at so the empirical floor/
# ceiling actually exceed ~10% of the time out-of-sample. Same pattern
# as calibrate_ngs_receiving_quantiles.R.
#
# Run: Rscript calibrate_target_share_quantiles.R
# (expects backtest_target_share_decay_results.rds from the prior script)

suppressMessages(library(nflreadr))

MAX_GAMES_PER_SEASON <- 16
METRIC <- "target_share"
POSITIONS <- c("WR", "TE")

TEST_SEASONS   <- 2022:2025
LOOKBACK_YEARS <- 3
N_SIMS <- 4000
MIN_HIST_GAMES <- 8

prior <- readRDS("backtest_target_share_decay_results.rds")
best_decay <- sapply(prior, function(x) x$best_decay)
cat("Loaded best decay per position from prior backtest:\n")
print(best_decay)
cat("\n")

FLOOR_Q_GRID <- sort(unique(c(seq(0.00001, 0.0005, by = 0.00002), seq(0.0005, 0.02, by = 0.0005), seq(0.02, 0.25, by = 0.01))))
CEIL_Q_GRID  <- sort(unique(c(seq(0.75, 0.99, by = 0.01), seq(0.99, 0.9995, by = 0.0005))))

cat("Loading player_stats for seasons", min(TEST_SEASONS) - LOOKBACK_YEARS, "-", max(TEST_SEASONS), "...\n")
ALL_SEASONS <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = ALL_SEASONS))
reg_all <- raw[raw$season_type == "REG", c("player_id", "player_display_name", "position", "season", "week", METRIC)]
reg_all <- reg_all[reg_all$position %in% POSITIONS, ]
reg_all <- reg_all[!is.na(reg_all[[METRIC]]), ]
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
  decay <- best_decay[[pos]]
  cat("=== ", pos, "/", METRIC, " (decay=", decay, ") ===\n", sep = "")

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
      if (nrow(a_row) == 0) next
      a <- mean(a_row[[METRIC]], na.rm = TRUE)

      sim <- simulate_season_means(d, METRIC, decay, avail, N_SIMS)
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

  cat("  -> CALIBRATED floor_q=", best_floor_q, " (", round(floor_rate[which.min(abs(floor_rate-10))],1),
      "% below) ceil_q=", best_ceil_q, " (", round(ceil_rate[which.min(abs(ceil_rate-10))],1),
      "% above) n=", n_total, "\n\n", sep = "")

  calib_results[[pos]] <- list(decay = decay, floor_q = best_floor_q, ceil_q = best_ceil_q)
}

cat("\n\n=========== FINAL SUMMARY: decay + calibrated internal quantiles ===========\n")
cat(sprintf("%-6s %-8s %-10s %-10s\n", "Pos", "Decay", "Floor_q", "Ceil_q"))
for (pos in names(calib_results)) {
  r <- calib_results[[pos]]
  cat(sprintf("%-6s %-8s %-10s %-10s\n", pos, r$decay, r$floor_q, r$ceil_q))
}

saveRDS(calib_results, "calibrate_target_share_quantiles_results.rds")
cat("\nSaved to calibrate_target_share_quantiles_results.rds\n")
