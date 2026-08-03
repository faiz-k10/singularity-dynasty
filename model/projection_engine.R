# Singularity Dynasty — Monte Carlo Projection Engine
#
# Bootstrap-resampling Monte Carlo simulation that powers (or will power)
# three product tools: Player Season Simulations, Best Ball Rankings, and
# Redraft Weekly Rankings. See README.md in this directory for the full
# methodology, backtest results, and what's still deferred.
#
# Requires: nflreadr (install.packages("nflreadr"))
#
# This script is NOT wired to Supabase yet — it prints projections to the
# console / returns a data frame. Publishing into player_simulations /
# best_ball_rankings / redraft_rankings is still a manual Table Editor step
# per CLAUDE.md, same as the other five tools' data.

suppressMessages(library(nflreadr))

# ============================= LOCKED PARAMETERS =============================
# Backtested via walk-forward validation (no lookahead) on 2022-2024 data,
# tested out-of-sample against the 2023-2025 projection window. See README.md
# for the backtest methodology and sample sizes per position.

MIN_GAMES <- 15   # eligibility floor. Below this a player isn't covered yet
                  # (deferred: rookies/low-sample players need the shrinkage
                  # path wired to a real trigger — see "Deferred" in README)

MED_DECAY   <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)  # Redraft Rankings
CEIL_DECAY  <- c(RB = 0.89, QB = 0.98, WR = 0.92, TE = 0.93)  # Best Ball Rankings
CEIL_Q      <- c(RB = 0.94, QB = 0.94, WR = 0.92, TE = 0.93)  # calibrated internal quantile for "ceiling"
FLOOR_Q     <- c(RB = 0.08, QB = 0.09, WR = 0.12, TE = 0.12)  # calibrated internal quantile for "floor"

MAX_GAMES_PER_SEASON <- 16   # 17 weeks minus 1 bye (weeks 1-17; week 18 excluded — see below)
AVAILABILITY_YEAR_DECAY <- 0.6  # not backtested — a judgment call weighting recent seasons'
                                 # availability more heavily than older ones

SHRINK_OWN_SHARE <- 0.80  # 80/20 blend for context-flagged players (team/OC/HC change).
                           # NOT backtested — locked by product judgment, revisit later.
BELLCOW_TPG_CUTOFF_PCTILE <- 0.85  # RB workload percentile above which a player is
                                    # excluded from the "common tier" shrinkage baseline

# Week 18 is deliberately excluded from all history: it shows the same ~8%
# scoring depression as week 1 (rested starters / backups), which was
# distorting recency-weighted projections. Week 17 is NOT excluded — it's a
# normal week and is the final week of most fantasy playoffs.
EXCLUDE_WEEKS <- c(18)

# ============================= DATA LOADING =============================

load_history <- function(seasons = 2023:2025) {
  stats <- load_player_stats(seasons = seasons)
  reg <- stats[stats$season_type == "REG",
               c("player_display_name", "position", "season", "week",
                 "fantasy_points_ppr", "carries", "targets")]
  reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
  reg <- reg[!is.na(reg$fantasy_points_ppr), ]
  reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
  reg$carries[is.na(reg$carries)] <- 0
  reg$targets[is.na(reg$targets)] <- 0
  reg$touches <- reg$carries + reg$targets
  reg[order(reg$player_display_name, reg$season, reg$week), ]
}

# ============================= CORE MATH =============================

# Recency weights: exponential decay, oldest game first, most recent game
# gets the highest weight. Normalized to sum to 1.
recency_weights <- function(n_games, decay) {
  w <- decay ^ ((n_games - 1):0)
  w / sum(w)
}

# Linearly interpolated weighted quantile. NOT the step-function version —
# interpolation matters: a step-function quantile can jump onto a single
# game's exact value when that game holds a lot of weight (found via the
# Michael Wilson ceiling artifact, see README). x and w must be paired
# (not pre-sorted); this sorts internally.
weighted_quantile <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]
  cw <- cumsum(w) / sum(w)
  k <- which(cw >= q)[1]
  if (k == 1) return(x[1])
  x[k - 1] + ((q - cw[k - 1]) / (cw[k] - cw[k - 1])) * (x[k] - x[k - 1])
}

# Shrinkage for context-flagged players (team change, or team-level OC/HC
# change from a manually maintained table — not built yet, see README).
# IMPORTANT: blend the QUANTILES of the two pools, not the pools themselves.
# Mixing distributions and then taking a quantile of the mixture does NOT
# reliably land between the two components' quantiles when one pool is
# sparse and lumpy — verified this breaks with Kenny Gainwell's game log
# (see README "Shrinkage bug" section). Blending pre-computed quantiles is
# the correct, safe way to do this.
shrunk_quantile <- function(own_x, own_w, baseline_x, baseline_w, q, own_share = SHRINK_OWN_SHARE) {
  own_q <- weighted_quantile(own_x, own_w, q)
  base_q <- weighted_quantile(baseline_x, baseline_w, q)
  own_share * own_q + (1 - own_share) * base_q
}

# Objective RB workload tiering: excludes rare "bellcow" RBs (top ~15% by
# touches/game) from the baseline pool that other RBs shrink toward, so a
# limited-role back doesn't get pulled toward a McCaffrey/Bijan-level
# baseline. Preserves the pool's own right tail (a common-tier back can
# still simulate a big game) — only the center moves down.
build_rb_common_pool <- function(reg, eligible_players) {
  rb_players <- eligible_players[sapply(eligible_players, function(p)
    reg$position[reg$player_display_name == p][1] == "RB")]
  tpg <- sapply(rb_players, function(p) mean(reg$touches[reg$player_display_name == p]))
  cutoff <- as.numeric(quantile(tpg, BELLCOW_TPG_CUTOFF_PCTILE))
  common_rbs <- rb_players[tpg < cutoff]
  pool <- reg$fantasy_points_ppr[reg$position == "RB" & reg$player_display_name %in% common_rbs]
  list(pool = pool, weights = rep(1 / length(pool), length(pool)), cutoff = cutoff)
}

# Recency-weighted availability: fraction of a max-16-game season a player
# has actually played, weighted so recent seasons count more. Used ONLY for
# season-total simulation (Player Season Simulations) — weekly figures
# (Redraft, Best Ball) stay pure per-game numbers per product decision;
# availability is a season-total concept, not a single-week one.
player_availability <- function(player_games_df) {
  yrs <- sort(unique(player_games_df$season))
  a_by_yr <- sapply(yrs, function(s) min(sum(player_games_df$season == s) / MAX_GAMES_PER_SEASON, 1))
  yw <- AVAILABILITY_YEAR_DECAY ^ ((length(yrs) - 1):0)
  yw <- yw / sum(yw)
  min(sum(a_by_yr * yw), 1)
}

# ============================= PROJECTION =============================

# Produces one row per eligible player: weekly floor/median/ceiling (for
# Redraft + Best Ball), season median (availability-adjusted, for Player
# Season Simulations), and a weeks-15-17 playoff ceiling (for Best Ball's
# second column). No shrinkage applied here — shrink_project() below is the
# entry point once a context-flag table exists.
project_all <- function(seasons = 2023:2025, n_sims = 30000, seed = 42) {
  set.seed(seed)
  reg <- load_history(seasons)
  counts <- table(reg$player_display_name)
  eligible <- names(counts[counts >= MIN_GAMES])

  rows <- vector("list", length(eligible))
  names(rows) <- eligible

  for (p in eligible) {
    d <- reg[reg$player_display_name == p, ]
    x <- d$fantasy_points_ppr
    pos <- d$position[1]
    n <- length(x)

    wm <- recency_weights(n, MED_DECAY[pos])
    wc <- recency_weights(n, CEIL_DECAY[pos])
    avail <- player_availability(d)

    szn <- replicate(n_sims, {
      g <- sum(runif(MAX_GAMES_PER_SEASON) < avail)
      if (g == 0) 0 else sum(sample(x, g, replace = TRUE, prob = wm))
    })
    playoff <- replicate(n_sims, sum(sample(x, 3, replace = TRUE, prob = wc)))

    rows[[p]] <- data.frame(
      player_name = p, position = pos, games = n,
      touches_per_game = round(mean(d$touches), 1),
      availability_pct = round(100 * avail, 0),
      floor = round(weighted_quantile(x, wm, FLOOR_Q[pos]), 1),
      median = round(weighted_quantile(x, wm, 0.50), 1),
      ceiling = round(weighted_quantile(x, wc, CEIL_Q[pos]), 1),
      season_median = round(quantile(szn, 0.50), 0),
      playoff_ceiling = round(quantile(playoff, CEIL_Q[pos]), 1)
    )
  }
  do.call(rbind, rows)
}

# ============================= EXAMPLE USAGE =============================
if (sys.nframe() == 0) {
  df <- project_all()
  cat("Eligible players:", nrow(df), "\n\n")
  rb <- df[df$position == "RB", ]
  cat("=== Redraft RB 1-15 (by weekly median) ===\n")
  print(head(rb[order(-rb$median), ], 15), row.names = FALSE)
}
