# Extension of backtest_stat_group_decay.R: given the decay already
# selected per (position, stat-group), find which INTERNAL quantile to
# query the simulated season-total distribution at so the empirical
# floor/ceiling actually exceed ~10% of the time out-of-sample -- same
# calibration concept as FLOOR_Q/CEIL_Q in projection_engine.R (README's
# "Quantile calibration" section), just applied to the season-sim's
# bootstrap distribution instead of the weekly weighted-quantile figures,
# and split by stat-group instead of one calibration per position.
#
# Reuses the exact same simulated draws to test many candidate quantiles
# per player (quantile() on an existing draw is cheap) rather than
# resimulating per candidate.
#
# Run: Rscript calibrate_stat_group_quantiles.R
# (expects backtest_stat_group_decay_results.rds from the prior script)

suppressMessages(library(nflreadr))

MAX_GAMES_PER_SEASON <- 16
EXCLUDE_WEEKS <- c(18)
AVAILABILITY_YEAR_DECAY <- 0.6

STAT_COLS <- c("passing_yards", "passing_tds", "passing_interceptions",
               "rushing_yards", "rushing_tds",
               "receptions", "receiving_yards", "receiving_tds")

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

TEST_SEASONS  <- 2022:2025
LOOKBACK_YEARS <- 3
N_SIMS <- 4000
MIN_HIST_GAMES <- 8

# Best decay per (position, group), from backtest_stat_group_decay.R's
# saved results.
prior <- readRDS("backtest_stat_group_decay_results.rds")
best_decay <- sapply(prior, function(x) x$best_decay)
cat("Loaded best decay per group from prior backtest:\n")
print(best_decay)
cat("\n")

# Candidate internal quantiles to query the bootstrap distribution at.
# Fine-grained since we need to land close to a true 10% exceed rate.
# Widened past [0.02, 0.99] after the first pass pinned several
# yardage-stat groups at exactly those edges -- need to know whether the
# true optimum is further out or genuinely unreachable within [0,1].
FLOOR_Q_GRID   <- sort(unique(c(seq(0.0005, 0.02, by = 0.0005), seq(0.02, 0.25, by = 0.01))))
CEIL_Q_GRID    <- sort(unique(c(seq(0.75, 0.99, by = 0.01), seq(0.99, 0.9995, by = 0.0005))))

cat("Loading nflreadr data for seasons", min(TEST_SEASONS) - LOOKBACK_YEARS, "-", max(TEST_SEASONS), "...\n")
ALL_SEASONS <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = ALL_SEASONS))
reg_all <- raw[raw$season_type == "REG",
               c("player_id", "player_display_name", "position", "season", "week", STAT_COLS)]
reg_all <- reg_all[reg_all$position %in% c("QB", "RB", "WR", "TE"), ]
reg_all <- reg_all[!(reg_all$week %in% EXCLUDE_WEEKS), ]
for (col in STAT_COLS) reg_all[[col]][is.na(reg_all[[col]])] <- 0
cat("Loaded", nrow(reg_all), "player-game rows.\n\n")

recency_weights <- function(n_games, decay) {
  w <- decay ^ ((n_games - 1):0)
  w / sum(w)
}

player_availability <- function(player_games_df, hist_seasons) {
  a_by_yr <- sapply(hist_seasons, function(s) {
    min(sum(player_games_df$season == s) / MAX_GAMES_PER_SEASON, 1)
  })
  yw <- AVAILABILITY_YEAR_DECAY ^ ((length(hist_seasons) - 1):0)
  yw <- yw / sum(yw)
  min(sum(a_by_yr * yw), 1)
}

simulate_season_totals <- function(game_log, stat_cols, decay, avail, n_sims) {
  n <- nrow(game_log)
  idx <- seq_len(n)
  w <- recency_weights(n, decay)
  g_draws <- rbinom(n_sims, MAX_GAMES_PER_SEASON, avail)
  out <- matrix(0, nrow = n_sims, ncol = length(stat_cols))
  colnames(out) <- stat_cols
  g_vals <- sort(unique(g_draws[g_draws > 0]))
  for (g in g_vals) {
    which_draws <- which(g_draws == g)
    cnt <- length(which_draws)
    sampled <- sample(idx, g * cnt, replace = TRUE, prob = w)
    sampled_mat <- matrix(sampled, nrow = g, ncol = cnt)
    for (col in stat_cols) {
      vals <- game_log[[col]][sampled_mat]
      dim(vals) <- c(g, cnt)
      out[which_draws, col] <- colSums(vals)
    }
  }
  out
}

positions <- c("QB", "RB", "WR", "TE")
groups <- list(td_int = TD_INT_STATS_BY_POS, yardage = YARDAGE_STATS_BY_POS)

calib_results <- list()

for (pos in positions) {
  for (group_name in names(groups)) {
    stat_cols <- groups[[group_name]][[pos]]
    if (is.null(stat_cols) || length(stat_cols) == 0) next
    key <- paste(pos, group_name, sep = "_")
    decay <- best_decay[[key]]

    cat("=== ", pos, "/", group_name, " (decay=", decay, ") ===\n", sep = "")

    below_floor_count <- matrix(0, nrow = length(FLOOR_Q_GRID), ncol = 1,
                                 dimnames = list(as.character(FLOOR_Q_GRID), NULL))
    above_ceil_count <- matrix(0, nrow = length(CEIL_Q_GRID), ncol = 1,
                                dimnames = list(as.character(CEIL_Q_GRID), NULL))
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

        sim <- simulate_season_totals(d, stat_cols, decay, avail, N_SIMS)
        for (col in stat_cols) {
          v <- sim[, col]
          a <- if (nrow(a_row) == 0) 0 else sum(a_row[[col]])
          n_total <- n_total + 1

          fl_candidates <- quantile(v, FLOOR_Q_GRID)
          below_floor_count[, 1] <- below_floor_count[, 1] + as.numeric(a < fl_candidates)

          ce_candidates <- quantile(v, CEIL_Q_GRID)
          above_ceil_count[, 1] <- above_ceil_count[, 1] + as.numeric(a > ce_candidates)
        }
      }
    }

    floor_rate <- 100 * below_floor_count[, 1] / n_total
    ceil_rate  <- 100 * above_ceil_count[, 1] / n_total

    best_floor_q <- FLOOR_Q_GRID[which.min(abs(floor_rate - 10))]
    best_ceil_q  <- CEIL_Q_GRID[which.min(abs(ceil_rate - 10))]

    cat("  Floor calibration (target: 10% of actuals fall below):\n")
    for (i in seq_along(FLOOR_Q_GRID)) {
      marker <- if (FLOOR_Q_GRID[i] == best_floor_q) " <-- best" else ""
      cat(sprintf("    internal_q=%.2f -> %.1f%% below-floor%s\n", FLOOR_Q_GRID[i], floor_rate[i], marker))
    }
    cat("  Ceiling calibration (target: 10% of actuals exceed):\n")
    for (i in seq_along(CEIL_Q_GRID)) {
      marker <- if (CEIL_Q_GRID[i] == best_ceil_q) " <-- best" else ""
      cat(sprintf("    internal_q=%.2f -> %.1f%% above-ceiling%s\n", CEIL_Q_GRID[i], ceil_rate[i], marker))
    }
    cat("  -> CALIBRATED floor_q=", best_floor_q, " ceil_q=", best_ceil_q, "\n\n", sep = "")

    calib_results[[key]] <- list(decay = decay, floor_q = best_floor_q, ceil_q = best_ceil_q,
                                  floor_rate_at_best = floor_rate[which.min(abs(floor_rate - 10))],
                                  ceil_rate_at_best = ceil_rate[which.min(abs(ceil_rate - 10))])
  }
}

cat("\n\n=========== FINAL SUMMARY: decay + calibrated internal quantiles ===========\n")
cat(sprintf("%-6s %-9s %-8s %-10s %-10s\n", "Pos", "Group", "Decay", "Floor_q", "Ceil_q"))
for (nm in names(calib_results)) {
  parts <- strsplit(nm, "_")[[1]]
  r <- calib_results[[nm]]
  cat(sprintf("%-6s %-9s %-8s %-10s %-10s\n", parts[1], paste(parts[-1], collapse = "_"), r$decay, r$floor_q, r$ceil_q))
}

saveRDS(calib_results, "calibrate_stat_group_quantiles_results.rds")
cat("\nSaved to calibrate_stat_group_quantiles_results.rds\n")
