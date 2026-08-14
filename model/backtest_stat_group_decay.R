# Backtest: separate recency-decay rates for touchdown/interception stats
# vs. yardage/volume stats, per position, scored against FULL-SEASON totals
# (not weekly Redraft predictions -- projection_engine.R's existing decay
# backtest optimizes next-game weekly accuracy; this one optimizes the
# Player Season Simulations use case directly: bootstrap a season the same
# way project_all() does, using only data before target season Y, and score
# the resulting floor/median/ceiling against Y's REAL realized stat total).
#
# Rationale: MED_DECAY/CEIL_DECAY are currently one value per position,
# reused for every stat column that position carries. Touchdown/INT counts
# are "lumpy" (most games are 0, production concentrates in a few games) --
# a decay tuned for smooth, every-game stats like yards may not be the
# right amount of recency-weighting for a lumpy stat. This script checks
# whether stat-group-specific decay actually reduces season-total
# prediction error, and if so, by how much per position/group.
#
# Run: Rscript backtest_stat_group_decay.R

suppressMessages(library(nflreadr))

MAX_GAMES_PER_SEASON <- 16
EXCLUDE_WEEKS <- c(18)
AVAILABILITY_YEAR_DECAY <- 0.6  # matches projection_engine.R -- not what's under test here

STAT_COLS <- c("passing_yards", "passing_tds", "passing_interceptions",
               "rushing_yards", "rushing_tds",
               "receptions", "receiving_yards", "receiving_tds")

# Same split rationale as MED_DECAY/CEIL_DECAY's existing position split,
# one level more granular: touchdown/interception counts (lumpy, few
# nonzero games) vs. yardage/volume counts (smooth, accrues every game).
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

TEST_SEASONS  <- 2022:2025   # walk-forward folds -- each uses only the 3 seasons before it
LOOKBACK_YEARS <- 3
DECAY_GRID    <- seq(0.70, 0.97, by = 0.03)
N_SIMS        <- 4000
MIN_HIST_GAMES <- 8   # matches the validated (not the lowered-for-Sanders) eligibility floor, see README

cat("Loading nflreadr data for seasons", min(TEST_SEASONS) - LOOKBACK_YEARS, "-", max(TEST_SEASONS), "...\n")
ALL_SEASONS <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = ALL_SEASONS))
reg_all <- raw[raw$season_type == "REG",
               c("player_id", "player_display_name", "position", "season", "week",
                 STAT_COLS)]
reg_all <- reg_all[reg_all$position %in% c("QB", "RB", "WR", "TE"), ]
reg_all <- reg_all[!(reg_all$week %in% EXCLUDE_WEEKS), ]
for (col in STAT_COLS) reg_all[[col]][is.na(reg_all[[col]])] <- 0
cat("Loaded", nrow(reg_all), "player-game rows.\n\n")

recency_weights <- function(n_games, decay) {
  w <- decay ^ ((n_games - 1):0)
  w / sum(w)
}

# Same shape as projection_engine.R's player_availability(), simplified for
# a fully-historical backtest context (no in-progress target season).
player_availability <- function(player_games_df, hist_seasons) {
  a_by_yr <- sapply(hist_seasons, function(s) {
    min(sum(player_games_df$season == s) / MAX_GAMES_PER_SEASON, 1)
  })
  yw <- AVAILABILITY_YEAR_DECAY ^ ((length(hist_seasons) - 1):0)
  yw <- yw / sum(yw)
  min(sum(a_by_yr * yw), 1)
}

pinball <- function(actual, pred, q) {
  ifelse(actual >= pred, q * (actual - pred), (1 - q) * (pred - actual))
}

# Vectorized season bootstrap: draws N_SIMS simulated seasons at once.
# g (games played) ~ Binomial(MAX_GAMES_PER_SEASON, avail) -- exactly
# equivalent to production's `sum(runif(16) < avail)`, just vectorized.
# For each distinct g value present among the draws, sample all needed
# game-indices in one shot (sample() call), reshape into a g x count
# matrix, and colSum per stat column -- avoids replicate()'s per-draw R
# overhead entirely.
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

results <- list()

for (pos in positions) {
  for (group_name in names(groups)) {
    stat_cols <- groups[[group_name]][[pos]]
    if (is.null(stat_cols) || length(stat_cols) == 0) next

    cat("=== ", pos, "/", group_name, " (", paste(stat_cols, collapse=", "), ") ===\n", sep = "")

    # Pre-build, per test season, the eligible player set + their history
    # game log + real actual totals -- doesn't depend on decay, so this is
    # computed once and reused across the whole decay grid below.
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
        player_actual[[p]] <- if (nrow(a) == 0) setNames(rep(0, length(stat_cols)), stat_cols)
                               else sapply(stat_cols, function(col) sum(a[[col]]))
      }
      fold_data[[as.character(Y)]] <- list(players = players, logs = player_logs,
                                            avail = player_avail, actual = player_actual)
      cat("  ", Y, ": ", length(players), " eligible players (history ", min(hist_seasons), "-", max(hist_seasons), ")\n", sep = "")
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
          sim <- simulate_season_totals(fd$logs[[p]], stat_cols, decay, fd$avail[[p]], N_SIMS)
          actual_vals <- fd$actual[[p]]
          for (col in stat_cols) {
            v <- sim[, col]
            fl <- as.numeric(quantile(v, 0.10))
            md <- as.numeric(quantile(v, 0.50))
            ce <- as.numeric(quantile(v, 0.90))
            a <- actual_vals[[col]]
            total_loss <- total_loss + pinball(a, fl, 0.10) + pinball(a, md, 0.50) + pinball(a, ce, 0.90)
            n_obs <- n_obs + 3
            below_floor <- below_floor + (a < fl)
            above_ceiling <- above_ceiling + (a > ce)
            n_calib <- n_calib + 1
          }
        }
      }
      loss_by_decay[di] <- total_loss / n_obs
      coverage_by_decay[[di]] <- c(below_floor_pct = round(100 * below_floor / n_calib, 1),
                                    above_ceiling_pct = round(100 * above_ceiling / n_calib, 1))
      cat("  decay=", decay, " avg pinball loss=", round(loss_by_decay[di], 4),
          " | below-floor%=", coverage_by_decay[[di]]["below_floor_pct"],
          " above-ceiling%=", coverage_by_decay[[di]]["above_ceiling_pct"], "\n", sep = "")
    }

    best_idx <- which.min(loss_by_decay)
    cat("  -> BEST decay for ", pos, "/", group_name, ": ", DECAY_GRID[best_idx],
        " (loss=", round(loss_by_decay[best_idx], 4), ", target below/above-floor ~10%/~10%)\n\n", sep = "")

    results[[paste(pos, group_name, sep = "_")]] <- list(
      stat_cols = stat_cols,
      loss_by_decay = loss_by_decay,
      coverage_by_decay = coverage_by_decay,
      best_decay = DECAY_GRID[best_idx]
    )
  }
}

cat("\n\n=========== SUMMARY ===========\n")
cat(sprintf("%-6s %-9s %-8s\n", "Pos", "Group", "BestDecay"))
for (nm in names(results)) {
  parts <- strsplit(nm, "_")[[1]]
  cat(sprintf("%-6s %-9s %-8s\n", parts[1], paste(parts[-1], collapse="_"), results[[nm]]$best_decay))
}

saveRDS(results, "backtest_stat_group_decay_results.rds")
cat("\nFull results saved to backtest_stat_group_decay_results.rds\n")
