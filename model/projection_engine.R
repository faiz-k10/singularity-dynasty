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

MIN_GAMES <- 8    # eligibility floor. Every player below LOW_SAMPLE_SHRINK_THRESHOLD
                  # (20) gets the 80/20 blend automatically, so low-sample players
                  # are covered but not fully trusted on their own history alone.

MED_DECAY   <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)  # Redraft Rankings
CEIL_DECAY  <- c(RB = 0.89, QB = 0.98, WR = 0.93, TE = 0.91)  # Best Ball Rankings
CEIL_Q      <- c(RB = 0.96, QB = 0.96, WR = 0.94, TE = 0.96)  # calibrated internal quantile for "ceiling"
FLOOR_Q     <- c(RB = 0.09, QB = 0.08, WR = 0.12, TE = 0.13)  # calibrated internal quantile for "floor"
CEIL_RANGE_LOW_Q <- CEIL_Q - 0.10  # lower bound of the Best Ball ceiling range (e.g. RB:
                                    # 0.86 vs ceiling's 0.96). NOT backtested like CEIL_Q
                                    # itself -- a judgment call pending validation.
                                    # IMPORTANT: because the range low and its hit-probability
                                    # both derive from quantiles of the SAME weighted game log,
                                    # ceiling_probability lands close to a FIXED ~10pt-of-mass
                                    # figure per position (currently ~14% RB/QB/TE, ~16% WR) by
                                    # construction, not a strongly player-differentiating stat --
                                    # it varies player-to-player only through sample size/ties,
                                    # not through any real skill signal. Revisit if that's not
                                    # what's wanted.

MAX_GAMES_PER_SEASON <- 16   # 17 weeks minus 1 bye (weeks 1-17; week 18 excluded — see below)
AVAILABILITY_YEAR_DECAY <- 0.6  # not backtested — a judgment call weighting recent seasons'
                                 # availability more heavily than older ones

SHRINK_OWN_SHARE <- 0.80  # 80/20 blend for context-flagged players (team/OC/HC change,
                           # manual player_flags.csv, and low-sample below).
                           # NOT backtested — locked by product judgment, revisit later.
LOW_SAMPLE_SHRINK_THRESHOLD <- 20  # players with MIN_GAMES <= n < this get the 80/20
                                    # blend automatically -- everyone below 20 games
                                    # is covered but not fully trusted on their own
                                    # history alone. Currently only takes effect at RB
                                    # (see below) -- no tiered baseline pool exists yet
                                    # for QB/WR/TE, so low-sample players there are
                                    # flagged but not actually shrunk.
HIGH_USAGE_CUTOFF_PCTILE <- 0.85  # workload percentile (per position) above which a
                                   # player is excluded from the "common tier"
                                   # shrinkage baseline -- applies to all 4 positions

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
                 "fantasy_points_ppr", "carries", "targets", "attempts", "team")]
  reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
  reg <- reg[!is.na(reg$fantasy_points_ppr), ]
  reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
  reg$carries[is.na(reg$carries)] <- 0
  reg$targets[is.na(reg$targets)] <- 0
  reg$attempts[is.na(reg$attempts)] <- 0
  reg$touches <- reg$carries + reg$targets
  # Usage metric per position, for tiered shrinkage baseline pools: RB uses
  # touches (carries+targets), WR/TE use targets, QB uses pass attempts.
  reg$usage <- ifelse(reg$position == "QB", reg$attempts, reg$touches)
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

# Objective workload tiering, generalized across all four positions:
# excludes the rare top-usage players (top ~15% by the position's usage
# metric — touches/game for RB/WR/TE, pass attempts/game for QB) from the
# baseline pool that other players at that position shrink toward, so a
# limited-role player doesn't get pulled toward a workhorse-level baseline.
# Preserves the pool's own right tail (a common-tier player can still
# simulate a big game) — only the center moves down. Originally built and
# validated for RB only (see README "RB tiering" section); the RB-specific
# validation doesn't automatically carry over to QB/WR/TE, which use the
# same mechanism but haven't been individually stress-tested the way RB was.
build_common_pool <- function(reg, eligible_players, position) {
  pos_players <- eligible_players[sapply(eligible_players, function(p)
    reg$position[reg$player_display_name == p][1] == position)]
  upg <- sapply(pos_players, function(p) mean(reg$usage[reg$player_display_name == p]))
  cutoff <- as.numeric(quantile(upg, HIGH_USAGE_CUTOFF_PCTILE))
  common_players <- pos_players[upg < cutoff]
  pool <- reg$fantasy_points_ppr[reg$position == position & reg$player_display_name %in% common_players]
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

# ============================= SHRINKAGE TRIGGER =============================
#
# One trigger: LOW SAMPLE SIZE, fully automatic. Any eligible player with
# fewer than LOW_SAMPLE_SHRINK_THRESHOLD games gets the SHRINK_OWN_SHARE
# blend applied, regardless of why their sample is small.
#
# Two other triggers existed earlier this session and were both removed:
# a manual per-team OC/HC-change flag (context_flags.csv), and automatic
# team-change detection (comparing load_player_stats() history against
# load_players()$latest_team). Both were removed by the user's direct
# instruction, in favor of relying on this single sample-size trigger.
#
# Real consequence worth knowing: an established player (25+ games) who
# switches teams — the original motivating case for shrinkage, before RJ
# Harvey — no longer gets any shrink adjustment under this design unless
# they also happen to be under the low-sample threshold. Team-change alone
# is no longer a signal this engine acts on.

# ============================= PROJECTION =============================

# Produces one row per eligible player: weekly floor/median/ceiling (for
# Redraft + Best Ball), season median (availability-adjusted, for Player
# Season Simulations), and a weeks-15-17 playoff ceiling (for Best Ball's
# second column).
project_all <- function(seasons = 2023:2025, n_sims = 30000, seed = 42,
                         apply_shrinkage = TRUE) {
  set.seed(seed)
  reg <- load_history(seasons)
  counts <- table(reg$player_display_name)
  eligible <- names(counts[counts >= MIN_GAMES])

  shrink_players <- character(0)
  baseline_pools <- list()
  if (apply_shrinkage) {
    shrink_players <- names(counts[counts >= MIN_GAMES & counts < LOW_SAMPLE_SHRINK_THRESHOLD])
    if (length(shrink_players) > 0) {
      shrink_positions <- unique(sapply(shrink_players, function(p)
        reg$position[reg$player_display_name == p][1]))
      for (pos in shrink_positions) {
        baseline_pools[[pos]] <- build_common_pool(reg, eligible, pos)
      }
    }
    cat("Shrink-eligible players this run:", length(shrink_players), "\n")
    if (length(shrink_players) > 0) cat(" -", paste(shrink_players, collapse = ", "), "\n")
  }

  # Current team for DISPLAY only (not a shrinkage signal — that trigger was
  # removed). Falls back to the most recent team in the game log if a
  # player isn't found in load_players() (rare -- retired/inactive edge
  # cases). Same "AZ" -> "ARI" mismatch as before applies here too.
  current_team <- load_players()[, c("display_name", "position", "latest_team")]
  current_team$latest_team <- ifelse(current_team$latest_team == "AZ", "ARI", current_team$latest_team)

  rows <- vector("list", length(eligible))
  names(rows) <- eligible

  for (p in eligible) {
    d <- reg[reg$player_display_name == p, ]
    x <- d$fantasy_points_ppr
    pos <- d$position[1]
    n <- length(x)

    team <- current_team$latest_team[current_team$display_name == p & current_team$position == pos]
    team <- if (length(team) == 1 && !is.na(team)) team else tail(d$team, 1)

    wm <- recency_weights(n, MED_DECAY[pos])
    wc <- recency_weights(n, CEIL_DECAY[pos])
    avail <- player_availability(d)

    szn <- replicate(n_sims, {
      g <- sum(runif(MAX_GAMES_PER_SEASON) < avail)
      if (g == 0) 0 else sum(sample(x, g, replace = TRUE, prob = wm))
    })
    playoff <- replicate(n_sims, sum(sample(x, 3, replace = TRUE, prob = wc)))

    shrink_this_player <- p %in% shrink_players && !is.null(baseline_pools[[pos]])
    if (shrink_this_player) {
      base <- baseline_pools[[pos]]
      fl  <- shrunk_quantile(x, wm, base$pool, base$weights, FLOOR_Q[pos])
      med <- shrunk_quantile(x, wm, base$pool, base$weights, 0.50)
      cei <- shrunk_quantile(x, wc, base$pool, base$weights, CEIL_Q[pos])
      cei_low <- shrunk_quantile(x, wc, base$pool, base$weights, CEIL_RANGE_LOW_Q[pos])
    } else {
      fl  <- weighted_quantile(x, wm, FLOOR_Q[pos])
      med <- weighted_quantile(x, wm, 0.50)
      cei <- weighted_quantile(x, wc, CEIL_Q[pos])
      cei_low <- weighted_quantile(x, wc, CEIL_RANGE_LOW_Q[pos])
    }
    # Probability of clearing the range's low end, grounded in the player's
    # own weighted game log (not the baseline pool, even when shrunk) --
    # this is "how often does THIS player personally clear that bar."
    cei_pct <- round(100 * sum(wc[x >= cei_low]) / sum(wc), 0)

    rows[[p]] <- data.frame(
      player_name = p, position = pos, team = team, games = n,
      touches_per_game = round(mean(d$touches), 1),
      availability_pct = round(100 * avail, 0),
      shrunk = shrink_this_player,
      floor = round(fl, 1),
      median = round(med, 1),
      ceiling = round(cei, 1),
      ceiling_range_low = round(cei_low, 1),
      ceiling_probability = cei_pct,
      # Season floor/ceiling use plain 10th/90th percentile of the 30,000-draw
      # simulated distribution directly -- NOT the calibrated FLOOR_Q/CEIL_Q,
      # which correct for small-sample bias in a *historical* game log. The
      # season sim doesn't have that problem; it's already a large Monte
      # Carlo sample, so a plain empirical quantile is the right tool here.
      season_floor = round(quantile(szn, 0.10), 0),
      season_median = round(quantile(szn, 0.50), 0),
      season_ceiling = round(quantile(szn, 0.90), 0),
      playoff_ceiling = round(quantile(playoff, CEIL_Q[pos]), 1)
    )
  }
  do.call(rbind, rows)
}

# ============================= SUPABASE EXPORT =============================
# Reshapes project_all()'s output into the three CSVs each table actually
# expects (see web/csv-upload-formats.html for the canonical column specs).
# `week` defaults to 1 -- bump it each time you republish through the
# season, per the existing convention documented for both tables.
export_for_supabase <- function(df, seasons = 2023:2025, week = 1) {
  season <- max(seasons) + 1

  redraft <- df[order(-df$median), ]
  write.csv(data.frame(
    season = season, week = week, rank = seq_len(nrow(redraft)),
    player_name = redraft$player_name, position = redraft$position,
    team = redraft$team, projection = redraft$median, notes = ""
  ), "upload_redraft_rankings.csv", row.names = FALSE)

  bb <- df[order(-df$ceiling), ]
  write.csv(data.frame(
    season = season, week = week, rank = seq_len(nrow(bb)),
    player_name = bb$player_name, position = bb$position, team = bb$team,
    ceiling_score = bb$ceiling,
    ceiling_range_low = bb$ceiling_range_low,
    ceiling_probability = bb$ceiling_probability,
    playoff_ceiling_score = bb$playoff_ceiling,
    notes = ""
  ), "upload_best_ball_rankings.csv", row.names = FALSE)

  write.csv(data.frame(
    season = season, player_name = df$player_name, position = df$position,
    team = df$team, floor = df$season_floor, median = df$season_median,
    ceiling = df$season_ceiling, notes = ""
  ), "upload_player_simulations.csv", row.names = FALSE)

  cat("Wrote upload_redraft_rankings.csv, upload_best_ball_rankings.csv,",
      "upload_player_simulations.csv (season =", season, ", week =", week, ")\n")
}

# ============================= RUN =============================
# Run from a terminal: Rscript projection_engine.R
# Writes projections.csv (every eligible player, every position) into this
# same directory — open it in Excel/Numbers, or use it as the source for
# formatting a Supabase upload CSV for player_simulations /
# best_ball_rankings / redraft_rankings.
if (sys.nframe() == 0) {
  df <- project_all()
  cat("\nEligible players:", nrow(df), "\n")

  write.csv(df, "projections.csv", row.names = FALSE)
  cat("Wrote projections.csv (", nrow(df), "rows ) to", getwd(), "\n\n")
  export_for_supabase(df)

  cat("=== Top 5 by weekly median, every position — full results are all in projections.csv ===\n")
  for (pos in c("QB", "RB", "WR", "TE")) {
    sub <- df[df$position == pos, ]
    cat("\n--", pos, "--\n")
    print(head(sub[order(-sub$median), c("player_name","games","median","ceiling","shrunk")], 5),
          row.names = FALSE)
  }
}
