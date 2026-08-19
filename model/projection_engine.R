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
suppressMessages(library(jsonlite))

# ============================= LOCKED PARAMETERS =============================
# Backtested via walk-forward validation (no lookahead) on 2022-2024 data,
# tested out-of-sample against the 2023-2025 projection window. See README.md
# for the backtest methodology and sample sizes per position.

MIN_GAMES <- 6    # eligibility floor. Every player below LOW_SAMPLE_SHRINK_THRESHOLD
                  # (20) gets the 80/20 blend automatically, so low-sample players
                  # are covered but not fully trusted on their own history alone.
                  # NOTE: the walk-forward backtest above validated 8, not 6 --
                  # lowered by direct product decision to let a promising rookie
                  # (Shedeur Sanders, 7 games) clear the floor instead of getting
                  # excluded entirely. Verified impact before lowering: only 7
                  # total players newly eligible, 6 of them deep-bench/shrink-
                  # heavy (sub-3 median) and functionally irrelevant -- Sanders
                  # was the only meaningful addition.

MED_DECAY   <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)  # Redraft Rankings
CEIL_DECAY  <- c(RB = 0.89, QB = 0.98, WR = 0.93, TE = 0.91)  # Best Ball Rankings
CEIL_Q      <- c(RB = 0.96, QB = 0.96, WR = 0.94, TE = 0.96)  # calibrated internal quantile for "ceiling"
FLOOR_Q     <- c(RB = 0.09, QB = 0.08, WR = 0.12, TE = 0.13)  # calibrated internal quantile for "floor"

# Granular per-stat SEASON projections (stat_ranges below -- Player Season
# Simulations' per-stat floor/median/ceiling) get their own decay and
# calibrated quantiles, split by stat-group instead of reusing the single
# per-position MED_DECAY/FLOOR_Q/CEIL_Q above. Backtested separately via
# walk-forward validation against REAL SEASON TOTALS (2022-2025 test
# folds, each scored using only the 3 seasons before it -- matches
# history_seasons()'s own lookback), NOT against next-game weekly
# accuracy like MED_DECAY/CEIL_DECAY above. See backtest_stat_group_decay.R
# and calibrate_stat_group_quantiles.R, and README.md's "Stat-group season
# calibration" section for the full sweep and methodology.
#
# The season sim already resamples with only ONE weight vector for the
# whole simulated distribution (wm, never wc -- see the points/szn
# resampling below), so unlike Redraft/Best Ball there's no separate
# median-decay/ceiling-decay split here: one decay drives the bootstrap
# per stat-group, floor/median/ceiling are just different quantiles of
# that same simulated distribution.
#
# Touchdown/interception counts (lumpy -- most games are 0 even for a
# real scoring threat) backtested toward LESS aggressive recency
# weighting (decay closer to 1.0) than the single blended decay above --
# a single recent game is a noisy signal of a player's true TD rate, so
# a good estimate needs more history averaged in, not less. This is the
# opposite of the naive assumption that a "lumpy" stat needs MORE
# reactivity to recent form, and it's the direct fix for a real
# observed case: Derrick Henry's rushing-TD ceiling was being pulled up
# disproportionately by one real 4-TD game (Week 17, 2025) under the
# single shared decay, because that decay was already overweighting
# recent games specifically for touchdowns.
STAT_GROUP_DECAY <- list(
  td_int  = c(QB = 0.97, RB = 0.94, WR = 0.94, TE = 0.97),
  yardage = c(QB = 0.82, RB = 0.85, WR = 0.82, TE = 0.94)
)

# Same calibration concept as FLOOR_Q/CEIL_Q above (query the simulated
# distribution at an internal quantile other than the literal 0.10/0.90
# so the REAL exceed rate actually comes out near 10%/90%), just split by
# stat-group and fit directly against the season-sim's own bootstrap
# distribution rather than a weighted quantile of raw weekly history.
#
# Touchdown/interception calibration is clean -- these landed on genuine
# interior optima, not pinned to a grid edge.
#
# Yardage/volume calibration does NOT fully close even at these values.
# Pushed to the edge of a sane grid (0.0005 / 0.99+), it still lands
# around 11-15% below-floor and ~9-10% above-ceiling instead of a true
# 10%/10% -- a real, structural gap, not a tuning failure: yardage
# totals are driven by role (snaps/targets/scheme), which can shift
# completely between seasons, and a same-player bootstrap has no way to
# represent an outcome outside that specific player's own game log. This
# is the same "role-stability" limitation already documented as deferred
# elsewhere in this file/README -- quantile tuning alone shrinks it
# (was ~40%/~17% miscalibrated before this) but can't close it.
STAT_GROUP_FLOOR_Q <- list(
  td_int  = c(QB = 0.016,  RB = 0.19,   WR = 0.12,   TE = 0.17),
  yardage = c(QB = 0.0005, RB = 0.0005, WR = 0.0005, TE = 0.0005)
)
STAT_GROUP_CEIL_Q <- list(
  td_int  = c(QB = 0.96,   RB = 0.87,  WR = 0.93,   TE = 0.82),
  yardage = c(QB = 0.9965, RB = 0.994, WR = 0.9965, TE = 0.99)
)

# Which group each granular stat column belongs to, for the split above.
STAT_GROUP_BY_STAT <- c(
  passing_tds = "td_int", passing_interceptions = "td_int",
  rushing_tds = "td_int", receiving_tds = "td_int",
  passing_yards = "yardage", rushing_yards = "yardage",
  receiving_yards = "yardage", receptions = "yardage"
)

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

MATCHUP_FULL_SAMPLE_GAMES <- 8  # games at which a defense's own fantasy-points-
                                 # allowed-by-position number is fully trusted
                                 # (pre-cap) -- reuses the same "half-season,
                                 # trust it" benchmark as MIN_GAMES elsewhere.
                                 # NOT separately backtested for defense.
MATCHUP_MULT_FLOOR <- 0.90  # opponent-strength multiplier clamp -- keeps a
MATCHUP_MULT_CEIL  <- 1.10  # small defensive sample or one fluke game from
                             # swinging a projection too far. Narrowed from an
                             # initial +/-20% after live review found it was
                             # moving final rankings more than intended --
                             # most defenses were hitting the cap outright, so
                             # the cap (not the raw signal) was the dominant
                             # lever. Product judgment,
                             # not backtested.

# Week 18 is deliberately excluded from all history: it shows the same ~8%
# scoring depression as week 1 (rested starters / backups), which was
# distorting recency-weighted projections. Week 17 is NOT excluded — it's a
# normal week and is the final week of most fantasy playoffs.
EXCLUDE_WEEKS <- c(18)

# Granular per-stat season projections for Player Season Simulations
# (floor/median/ceiling for each, not just total fantasy points). All 8
# columns are simulated for every player regardless of position (simpler,
# uniform code path) -- STAT_COLS_BY_POSITION below decides which ones
# actually get published for a given position, so a WR's export doesn't
# carry meaningless passing_yards fields.
STAT_COLS <- c("passing_yards", "passing_tds", "passing_interceptions",
               "rushing_yards", "rushing_tds",
               "receptions", "receiving_yards", "receiving_tds")
STAT_COLS_BY_POSITION <- list(
  QB = c("passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds"),
  RB = c("rushing_yards", "rushing_tds", "receptions", "receiving_yards", "receiving_tds"),
  WR = c("receptions", "receiving_yards", "receiving_tds"),
  TE = c("receptions", "receiving_yards", "receiving_tds")
)

# Usage/efficiency columns for Player Season Simulations' WOPR/EPA fields.
# WOPR is receiving usage only (left NA for QB); EPA is position-relevant
# (passing for QB, rushing+receiving for RB, receiving for WR/TE) -- see
# the wopr/epa computation in project_all()'s per-player loop below.
USAGE_METRIC_COLS <- c("wopr", "passing_epa", "rushing_epa", "receiving_epa")

# Own decay per metric, per position -- backtested separately
# (backtest_usage_metric_decay.R, walk-forward MAE of predicted vs. real
# season-ahead average) rather than reusing MED_DECAY, same rationale as
# STAT_GROUP_DECAY above: a decay tuned for the blended fantasy-points
# total isn't necessarily right for a different target metric. Confirmed
# it wasn't: EPA wants MUCH less aggressive decay than MED_DECAY at every
# position (0.94-0.97 vs 0.87-0.92) -- it's noisy game-to-game, same
# "lumpy stat needs more history averaged in" pattern as touchdowns/
# interceptions above, not the naive "recent form reacts faster"
# assumption. WOPR is closer to MED_DECAY but still meaningfully higher
# for RB (0.94 vs 0.87) and TE (0.94 vs 0.92). EPA's backtest picked the
# grid edge (0.97) at every position -- true optimum may be even less
# aggressive, but 0.97 (near-uniform) is close enough that a wider grid
# wasn't worth the extra runtime; revisit if EPA prediction error becomes
# a concern.
WOPR_DECAY <- c(RB = 0.94, WR = 0.88, TE = 0.94)  # no QB -- not applicable
EPA_DECAY  <- c(QB = 0.97, RB = 0.97, WR = 0.97, TE = 0.97)

# Avg Separation / YAC Above Expectation (WR/TE only, part of stat_ranges
# below) -- backtested via backtest_ngs_receiving_decay.R +
# calibrate_ngs_receiving_quantiles.R, same walk-forward methodology as
# STAT_GROUP_DECAY/FLOOR_Q/CEIL_Q but scored on a season-AVERAGE bootstrap
# (mean of resampled games) instead of a season-total one, since both are
# rate stats, not counting stats. floor_q/ceil_q here are the INTERNAL
# quantile to query the bootstrap distribution at, calibrated so the real
# value falls outside ~10% of the time out-of-sample -- NOT literally
# 0.10/0.90 (same "calibrated quantile" concept as FLOOR_Q/CEIL_Q above).
NGS_DECAY <- list(
  WR = c(avg_separation = 0.94, yac_above_exp = 0.97),
  TE = c(avg_separation = 0.97, yac_above_exp = 0.97)
)
NGS_FLOOR_Q <- list(
  WR = c(avg_separation = 0.008, yac_above_exp = 0.03),
  TE = c(avg_separation = 0.11,  yac_above_exp = 0.05)
)
NGS_CEIL_Q <- list(
  WR = c(avg_separation = 0.97, yac_above_exp = 0.98),
  TE = c(avg_separation = 0.98, yac_above_exp = 0.88)
)
NGS_MIN_GAMES <- 8  # matches the backtest's own eligibility floor

# The season we're publishing rankings/projections FOR. Fixed -- does NOT
# shift automatically when the calendar rolls over; bump it by hand once
# the 2027 season actually starts being the one to project.
TARGET_SEASON <- 2026

# Seasons of history to feed the model: the fixed 3-year lookback, PLUS
# the target season itself -- but ONLY once nflreadr considers it a real,
# loadable season (its most_recent_season() flips over on the actual
# season-opener date). load_player_stats() hard-errors, rather than
# returning zero rows, for any season beyond that -- so this must gate on
# most_recent_season(), not just "does the target season have data yet".
# Once it does become loadable, this folds the target season's own games
# in as the most-recent (most heavily weighted) data instead of
# projections staying frozen on last year's numbers all season.
history_seasons <- function(target_season = TARGET_SEASON, lookback_years = 3) {
  latest <- min(target_season, most_recent_season())
  (target_season - lookback_years):latest
}

# Opponent-strength window: current + prior season only, NOT the full
# 3-year lookback used for player history. Defensive personnel/scheme
# turns over much faster than offensive skill talent -- a 2023 defense
# says little about this year's unit under a new DC.
defense_history_seasons <- function(target_season = TARGET_SEASON) {
  latest <- min(target_season, most_recent_season())
  (target_season - 1):latest
}

# ============================= DATA LOADING =============================

load_history <- function(seasons = history_seasons()) {
  # as.data.frame(): load_player_stats() returns a data.table, and its
  # non-standard `[` evaluation gets confused when a variable (STAT_COLS)
  # is nested inside the column-selector c(...) alongside literal string
  # names -- it silently returns a flat character vector instead of
  # subsetting columns, rather than erroring. Same fix already applied to
  # load_opponents()/load_out_players() earlier for the same root cause
  # (data.table NSE), applied here preventatively too.
  stats <- as.data.frame(load_player_stats(seasons = seasons))
  reg <- stats[stats$season_type == "REG",
               c("player_id", "player_display_name", "position", "season", "week",
                 "fantasy_points_ppr", "carries", "targets", "attempts", "team",
                 STAT_COLS, USAGE_METRIC_COLS)]
  reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
  reg <- reg[!is.na(reg$fantasy_points_ppr), ]
  reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
  reg$carries[is.na(reg$carries)] <- 0
  reg$targets[is.na(reg$targets)] <- 0
  for (col in USAGE_METRIC_COLS) reg[[col]][is.na(reg[[col]])] <- 0
  reg$attempts[is.na(reg$attempts)] <- 0
  for (col in STAT_COLS) reg[[col]][is.na(reg[[col]])] <- 0
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

# Weighted MEAN (not quantile) -- used only for the raw per-stat weekly
# values that power Redraft's custom scoring settings. Deliberately mean,
# not median: a fantasy score is a LINEAR combination of its raw
# components (points = 0.1*yards + 6*tds + ...), and mean is the only
# statistic where mean(sum of components) == sum(mean of components).
# Median doesn't have that property -- verified directly that summing
# each raw stat's median independently understates the real total by
# ~40% for a player like Jahmyr Gibbs, because touchdowns are "lumpy"
# (most individual games are 0 TDs even for a player who scores in
# most weeks on average), so a per-game median silently rounds a real
# scoring threat down to zero. Mean has no such blind spot. Shrinkage
# blending is also linear (own_share*A + (1-own_share)*B), so it
# commutes with the scoring formula too -- the reconstructed total
# stays mathematically exact even for shrink-eligible players.
weighted_mean <- function(x, w) sum(x * w) / sum(w)

shrunk_mean <- function(own_x, own_w, baseline_x, baseline_w, own_share = SHRINK_OWN_SHARE) {
  own_m <- weighted_mean(own_x, own_w)
  base_m <- weighted_mean(baseline_x, baseline_w)
  own_share * own_m + (1 - own_share) * base_m
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
build_common_pool <- function(reg, eligible_players, position, stat_col = "fantasy_points_ppr") {
  pos_players <- eligible_players[sapply(eligible_players, function(p)
    reg$position[reg$player_display_name == p][1] == position)]
  upg <- sapply(pos_players, function(p) mean(reg$usage[reg$player_display_name == p]))
  cutoff <- as.numeric(quantile(upg, HIGH_USAGE_CUTOFF_PCTILE))
  common_players <- pos_players[upg < cutoff]
  pool <- reg[[stat_col]][reg$position == position & reg$player_display_name %in% common_players]
  list(pool = pool, weights = rep(1 / length(pool), length(pool)), cutoff = cutoff)
}

# Recency-weighted availability: fraction of a max-16-game season a player
# has actually played, weighted so recent seasons count more. Used ONLY for
# season-total simulation (Player Season Simulations) — weekly figures
# (Redraft, Best Ball) stay pure per-game numbers per product decision;
# availability is a season-total concept, not a single-week one.
#
# `completed_weeks` (weeks of `target_season` that have fully finished,
# per current_nfl_week() -- 0 before the season starts) matters because
# TARGET_SEASON's own games are now folded into history (see
# history_seasons()). A completed PAST season correctly divides by the
# full 16-game season. But dividing TARGET_SEASON's games-so-far by that
# same 16 right after Week 1 would read a healthy player who's played
# every game as ~6% available -- an in-progress season isn't a bad past
# season, it just hasn't happened yet. Divide TARGET_SEASON by how much
# of it has actually elapsed instead, so "played every game so far" reads
# as ~100% available, not "barely available."
player_availability <- function(player_games_df, target_season = TARGET_SEASON,
                                 completed_weeks = 0) {
  yrs <- sort(unique(player_games_df$season))
  # A player who has missed the season entirely so far has ZERO rows for
  # target_season -- it wouldn't appear in `yrs` at all, so they'd never
  # get penalized for it. Force it in once the season is underway, so
  # "0 games out of completed_weeks" actually counts as 0%, not "no data,
  # skip this year."
  if (completed_weeks > 0 && !(target_season %in% yrs)) {
    yrs <- sort(c(yrs, target_season))
  }
  a_by_yr <- sapply(yrs, function(s) {
    denom <- if (s == target_season && completed_weeks > 0) completed_weeks else MAX_GAMES_PER_SEASON
    min(sum(player_games_df$season == s) / denom, 1)
  })
  yw <- AVAILABILITY_YEAR_DECAY ^ ((length(yrs) - 1):0)
  yw <- yw / sum(yw)
  min(sum(a_by_yr * yw), 1)
}

# ============================= SHRINKAGE TRIGGERS =============================
#
# Trigger 1: LOW SAMPLE SIZE, fully automatic. Any eligible player with
# fewer than LOW_SAMPLE_SHRINK_THRESHOLD games gets the SHRINK_OWN_SHARE
# blend applied, regardless of why their sample is small.
#
# Trigger 2: DIDN'T FINISH THE LAST COMPLETED SEASON. Weekly figures
# (Redraft/Best Ball) are built purely from a player's own game log with
# recency weighting -- they have no concept of "has this player's season
# ended," unlike Player Season Simulations' availability calc (which
# already discounts a player who went down and never came back, via
# per-year games-played fractions). Found via James Conner: played weeks
# 1-3 of 2025, then nothing -- still "established" on 31 total games, so
# weekly projections ranked him like a healthy every-week starter with no
# penalty at all. If a player's last game in the last completed season
# was at or before TAIL_ABSENCE_CUTOFF_WEEK, they get the same 80/20
# blend toward the positional baseline as low-sample players -- an
# automatic, data-driven rule (not a per-player list), matching the
# season-ended shape without needing to know *why* (injury, benching,
# etc.).
TAIL_ABSENCE_CUTOFF_WEEK <- 10  # last game in the prior season at or before
                                 # this week => didn't finish that season

# Trigger 3: TEAM CHANGE, fully automatic. Compares each eligible player's
# last known team in their own game log against their current-season
# roster team from load_rosters(target_season). A new team means a new
# offense/role/QB that last season's box scores can't speak to -- see the
# implementation in project_all() for the AZ/ARI normalization and
# fail-safe details. This was removed once already (commit 3b27ec0,
# "Simplify to a single shrinkage trigger") and re-added on direct
# instruction; it now reuses load_rosters(), the same season-scoped
# source as the no-current-team eligibility filter, rather than the old
# load_players()$latest_team rolling snapshot.
#
# A manual per-team OC/HC-change flag (context_flags.csv) also existed
# alongside the original team-change trigger and was removed in the same
# commit; it has NOT been re-added.
#
# Real consequence worth knowing: an established player (25+ games) who
# switches teams — the original motivating case for shrinkage, before RJ
# Harvey — no longer gets any shrink adjustment under this design unless
# they also happen to trigger low-sample or tail-absence. Team-change
# alone is still not a signal this engine acts on.

# The real NFL week to publish for, by date -- not a manually bumped
# counter. A week counts as "current" until every one of its games has
# been played; before the season starts, every week is still upcoming, so
# this correctly resolves to 1. After the season ends, falls back to the
# final week rather than erroring.
current_nfl_week <- function(season) {
  sch <- as.data.frame(load_schedules(season))
  sch <- sch[!is.na(sch$week), ]
  gameday <- as.numeric(as.Date(sch$gameday))
  today <- as.numeric(Sys.Date())
  weeks <- sort(unique(sch$week))
  week_end <- sapply(weeks, function(w) max(gameday[sch$week == w]))
  upcoming <- weeks[week_end >= today]
  if (length(upcoming) == 0) return(max(weeks))
  min(upcoming)
}

# Opponent per team for the given week, for Redraft/Best Ball's Opponent
# column.
#
# load_schedules() returns a data.table, not a plain data.frame -- inside
# `sch[sch$week == week, ...]`, data.table's non-standard evaluation
# resolves the bare `week` on the right of `==` to the *column* `week`
# (since a column of that name exists), not this function's `week`
# parameter, silently turning the filter into `sch$week == sch$week`
# (true for every row, all 17 weeks) instead of `sch$week == 1`. Found
# via a real wrong-opponent report -- every team's Opponent was being
# computed from whichever row happened to survive R's row-decides-first
# tie resolution across all 17 weeks, not the actual current week.
# as.data.frame() strips data.table's class so `[` uses ordinary base-R
# scoping (the parameter always wins), eliminating the whole bug class.
load_opponents <- function(season, week) {
  sch <- as.data.frame(load_schedules(season))
  wk <- sch[sch$week == week, c("away_team", "home_team")]
  setNames(c(wk$home_team, wk$away_team), c(wk$away_team, wk$home_team))
}

# Opponent-strength multiplier per (defense, position): fantasy points
# allowed relative to league average that position, shrunk toward 1.0
# (neutral) by games played and capped to [MATCHUP_MULT_FLOOR,
# MATCHUP_MULT_CEIL]. Uses load_player_stats()'s own opponent_team field
# -- no separate data source needed. Returns a named vector keyed
# "TEAM POS" (e.g. "PIT RB") -> multiplier.
compute_matchup_multipliers <- function(seasons = defense_history_seasons()) {
  # as.data.frame(): see load_history()'s comment -- same defensive fix
  # against data.table's NSE quirks, applied consistently everywhere this
  # codebase loads an nflreadr table directly.
  stats <- as.data.frame(load_player_stats(seasons = seasons))
  d <- stats[stats$season_type == "REG",
             c("position", "season", "week", "opponent_team", "fantasy_points_ppr")]
  d <- d[d$position %in% c("QB", "RB", "WR", "TE"), ]
  d <- d[!is.na(d$fantasy_points_ppr) & !is.na(d$opponent_team), ]

  # Points allowed per defense-week-position: sum across all opposing
  # players of that position who faced that defense that week.
  allowed <- aggregate(fantasy_points_ppr ~ opponent_team + position + season + week,
                        data = d, FUN = sum)
  names(allowed)[names(allowed) == "opponent_team"] <- "defense"

  league_avg <- tapply(allowed$fantasy_points_ppr, allowed$position, mean)
  defense_avg <- aggregate(fantasy_points_ppr ~ defense + position, data = allowed, FUN = mean)
  defense_games <- aggregate(fantasy_points_ppr ~ defense + position, data = allowed, FUN = length)
  names(defense_games)[3] <- "games"

  m <- merge(defense_avg, defense_games, by = c("defense", "position"))
  m$league_avg <- league_avg[m$position]
  m$raw_mult <- m$fantasy_points_ppr / m$league_avg
  m$shrink_share <- pmin(m$games / MATCHUP_FULL_SAMPLE_GAMES, 1)
  m$mult <- 1 + m$shrink_share * (m$raw_mult - 1)
  m$mult <- pmin(pmax(m$mult, MATCHUP_MULT_FLOOR), MATCHUP_MULT_CEIL)

  setNames(m$mult, paste(m$defense, m$position))
}

# Official weekly injury report (same nflverse source as everything else),
# matched to player_display_name by full_name -- ~96% match rate verified
# (unmatched players have no stat history anyway, so they're never in the
# eligible pool to begin with). Only "Out" is an automatic override --
# Doubtful/Questionable are real uncertainty the model's own floor/ceiling
# spread already covers, not a hard zero.
#
# Same data.table NSE bug as load_opponents() above (parameter `week`
# colliding with a column named `week`) -- as.data.frame() fixes it here
# too. Never triggered visibly yet since load_injuries(2026) still errors
# pre-season, but would have marked every injured player across the
# entire loaded window "OUT" the first time this started actually
# running, not just this week's real list.
load_out_players <- function(season, week) {
  inj <- as.data.frame(load_injuries(season))
  inj <- inj[inj$week == week & !is.na(inj$report_status) & inj$report_status == "Out", ]
  unique(inj$full_name)
}

# One QB per team: the current depth-chart starter (pos_rank 1), falling
# back to the next-ranked QB on that team's chart if the starter isn't in
# `eligible_players` -- e.g. Deshaun Watson is Cleveland's named 2026
# starter but has zero 2025 games, so he fails the separate last-season-
# presence eligibility check. Without this fallback, that team would show
# no QB at all rather than whoever's actually next in line and has real
# recent history to project from.
#
# Matched to player_display_name by player_name (verified 32/32 exact
# match against the model's own naming, unlike load_out_players' ~96%).
# Unlike stats/injuries, depth charts aren't gated by most_recent_season()
# -- daily snapshots are already available for TARGET_SEASON.
select_team_qbs <- function(season, eligible_players) {
  dc <- as.data.frame(load_depth_charts(season))
  latest <- dc[dc$dt == max(dc$dt) & dc$pos_abb == "QB", ]
  latest <- latest[order(latest$team, latest$pos_rank), ]
  picks <- sapply(unique(latest$team), function(tm) {
    chart <- latest[latest$team == tm, ]
    chart <- chart[order(chart$pos_rank), ]
    pick <- chart$player_name[chart$player_name %in% eligible_players]
    if (length(pick) == 0) NA_character_ else pick[1]
  })
  unique(picks[!is.na(picks)])
}

# ============================= PROJECTION =============================

# Produces one row per eligible player: weekly floor/median/ceiling (for
# Redraft + Best Ball), season median (availability-adjusted, for Player
# Season Simulations), and a weeks-15-17 playoff ceiling (for Best Ball's
# second column).
project_all <- function(seasons = history_seasons(), n_sims = 30000, seed = 42,
                         apply_shrinkage = TRUE, target_season = TARGET_SEASON) {
  set.seed(seed)
  reg <- load_history(seasons)
  # Position-relevant EPA as a single column, computed up front so it can
  # go through the same build_common_pool()/shrunk_mean() shrinkage path
  # as every other per-stat column below -- WOPR/EPA get the identical
  # recency-weighted + shrinkage-blended treatment as the rest of the
  # model's projections, not a plain historical average, so they're a
  # genuine season-ahead projection like everything else on this page
  # rather than a stat anyone could reproduce straight off nflreadr.
  reg$epa_component <- ifelse(reg$position == "QB", reg$passing_epa + reg$rushing_epa,
                        ifelse(reg$position == "RB", reg$rushing_epa + reg$receiving_epa,
                               reg$receiving_epa))
  counts <- table(reg$player_display_name)
  eligible <- names(counts[counts >= MIN_GAMES])

  # Recency weighting only knows "games ago" within a player's own log --
  # it can't tell "played last week" from "played 5 weeks into last
  # season with a full season of nothing since." A player with zero games
  # in the last completed season (e.g. hurt, benched, off a roster all
  # year) still passes MIN_GAMES on old history alone and gets ranked as
  # if that stale history were current. Found via Sam Howell (0 games in
  # 2025, ranked ~51st on 2024 history) -- require real presence in the
  # last completed season to stay eligible at all.
  #
  # Deliberately fixed to TARGET_SEASON - 1 (the last full season), NOT
  # `max(reg$season)`. Once TARGET_SEASON's own games are folded into reg
  # (see history_seasons()), max(reg$season) would become TARGET_SEASON
  # itself -- which would instantly drop any player who simply hasn't
  # played yet this week (early bye-adjacent absence, minor stuff), rather
  # than letting a real cold/inactive season drag them down the rankings
  # naturally via the recency-weighted numbers once games start counting.
  last_completed_season <- TARGET_SEASON - 1
  played_recently <- unique(reg$player_display_name[reg$season == last_completed_season])
  eligible <- intersect(eligible, played_recently)

  # Backup QBs excluded entirely (all three tables) -- current depth
  # chart, not last season's history, since a QB's competition/starter
  # status can change independent of how they performed historically.
  # Falls back to the next eligible QB on a team's chart if the nominal
  # starter isn't eligible (see select_team_qbs()). Fails safe: if
  # depth-chart data is unavailable, skip this filter rather than
  # accidentally dropping every QB.
  qb_starters <- tryCatch(select_team_qbs(target_season, eligible), error = function(e) {
    cat("Depth chart unavailable this run -- skipping backup-QB filter:", conditionMessage(e), "\n")
    NULL
  })
  if (!is.null(qb_starters)) {
    player_positions <- reg$position[match(eligible, reg$player_display_name)]
    is_backup_qb <- player_positions == "QB" & !(eligible %in% qb_starters)
    cat("Backup QBs removed:", sum(is_backup_qb), "-", paste(eligible[is_backup_qb], collapse = ", "), "\n")
    eligible <- eligible[!is_backup_qb]
  }

  # Not currently on any NFL roster this season (retired, cut, unsigned
  # free agent) -- current_team's latest_team/tail(d$team,1) fallback
  # below still assigns these players a team string (their last known
  # one), so filtering on a blank/NA team wouldn't catch them; this
  # checks actual season-scoped roster presence instead. Matched by
  # gsis_id, NOT name+position -- found via Kenny Gainwell (game log:
  # "Kenny Gainwell"; load_rosters(): "Kenneth Gainwell", legal name),
  # an active Buccaneer who name-matching silently misidentified as a
  # free agent and dropped from every table. gsis_id is stable across
  # both nflreadr sources regardless of which name variant either one
  # uses. Fails safe in both directions: a player whose own id can't be
  # found is left alone (kept) rather than assumed teamless, and if
  # roster data is unavailable at all, the filter is skipped entirely.
  id_by_name <- setNames(reg$player_id[match(eligible, reg$player_display_name)], eligible)
  rosters_this_season <- tryCatch(as.data.frame(load_rosters(target_season)), error = function(e) {
    cat("Roster data unavailable this run -- skipping no-team filter:", conditionMessage(e), "\n")
    NULL
  })
  if (!is.null(rosters_this_season)) {
    rostered_ids <- unique(rosters_this_season$gsis_id)
    has_no_team <- !is.na(id_by_name) & !(id_by_name %in% rostered_ids)
    cat("No current team this season -- removed:", sum(has_no_team), "-", paste(eligible[has_no_team], collapse = ", "), "\n")
    eligible <- eligible[!has_no_team]
    id_by_name <- id_by_name[!has_no_team]
  }

  shrink_players <- character(0)
  baseline_pools <- list()
  stat_pools <- list()
  if (apply_shrinkage) {
    low_sample_players <- names(counts[counts >= MIN_GAMES & counts < LOW_SAMPLE_SHRINK_THRESHOLD])

    last_season_reg <- reg[reg$season == last_completed_season, ]
    last_week_last_season <- tapply(last_season_reg$week, last_season_reg$player_display_name, max)
    tail_absence_players <- names(last_week_last_season[last_week_last_season <= TAIL_ABSENCE_CUTOFF_WEEK])

    # Trigger 3: TEAM CHANGE, fully automatic -- compares each eligible
    # player's last known team in their own game log against their
    # CURRENT (this-season) roster team from load_rosters(target_season),
    # the same source used for the no-current-team filter above (more
    # reliable than the old load_players()$latest_team, which is a single
    # rolling snapshot rather than season-scoped). A new team means a new
    # offense/role/QB that last season's box scores can't speak to, same
    # reasoning as low-sample and tail-absence. Re-added after being
    # removed in 3b27ec0 -- re-requested directly. Fails safe: if roster
    # data is unavailable (rosters_this_season is NULL), this trigger
    # simply contributes nothing rather than erroring.
    team_change_players <- character(0)
    if (!is.null(rosters_this_season)) {
      # Matched by gsis_id, same reasoning and same bug (Kenny/Kenneth
      # Gainwell) as the no-current-team filter above -- name+position
      # matching would both miss real team changes for players whose
      # game-log name differs from their roster name, AND could
      # false-positive "changed teams" for a player who never actually
      # moved, purely from the name mismatch alone.
      normalize_team <- function(team) ifelse(team == "AZ", "ARI", team)
      reg_ord <- reg[order(reg$player_display_name, reg$season, reg$week), ]
      last_rows <- reg_ord[!duplicated(reg_ord$player_display_name, fromLast = TRUE), ]
      last_team_by_id <- setNames(normalize_team(last_rows$team), last_rows$player_id)
      current_roster <- rosters_this_season[!duplicated(rosters_this_season$gsis_id), ]
      current_team_by_id <- setNames(normalize_team(current_roster$team), current_roster$gsis_id)

      pid <- id_by_name[eligible]
      last_team <- unname(last_team_by_id[pid])
      cur_team <- unname(current_team_by_id[pid])
      changed <- !is.na(pid) & !is.na(last_team) & !is.na(cur_team) & last_team != cur_team
      team_change_players <- eligible[changed]
    }

    shrink_players <- union(union(low_sample_players, tail_absence_players), team_change_players)
    if (length(shrink_players) > 0) {
      shrink_positions <- unique(sapply(shrink_players, function(p)
        reg$position[reg$player_display_name == p][1]))
      for (pos in shrink_positions) {
        baseline_pools[[pos]] <- build_common_pool(reg, eligible, pos)
        # Same 80/20 blend, but per raw stat column instead of the blended
        # fantasy_points_ppr total -- powers Redraft's custom scoring
        # settings (PPR/TE premium/passing-TD/INT toggles), which need to
        # recompute a player's points from their own component stats
        # rather than a single fixed-scoring number.
        stat_pools[[pos]] <- list()
        for (col in STAT_COLS_BY_POSITION[[pos]]) {
          stat_pools[[pos]][[col]] <- build_common_pool(reg, eligible, pos, stat_col = col)
        }
        # Same shrinkage pools for WOPR/EPA -- wopr skipped for QB (not a
        # receiving-usage position).
        if (pos != "QB") {
          stat_pools[[pos]][["wopr"]] <- build_common_pool(reg, eligible, pos, stat_col = "wopr")
        }
        stat_pools[[pos]][["epa_component"]] <- build_common_pool(reg, eligible, pos, stat_col = "epa_component")
      }
    }
    cat("Shrink-eligible players this run:", length(shrink_players),
        "(", length(low_sample_players), "low-sample,", length(tail_absence_players), "tail-absence,",
        length(team_change_players), "team-change )\n")
    if (length(shrink_players) > 0) cat(" -", paste(shrink_players, collapse = ", "), "\n")
  }

  # Current team for DISPLAY only (not a shrinkage signal — that trigger was
  # removed). Falls back to the most recent team in the game log if a
  # player isn't found in load_players() (rare -- retired/inactive edge
  # cases). Same "AZ" -> "ARI" mismatch as before applies here too.
  current_team <- as.data.frame(load_players())[, c("display_name", "position", "latest_team")]
  current_team$latest_team <- ifelse(current_team$latest_team == "AZ", "ARI", current_team$latest_team)
  publish_week <- current_nfl_week(target_season)
  week_opponent <- load_opponents(target_season, publish_week)
  completed_weeks <- max(publish_week - 1, 0)

  # Opponent-strength adjustment for THIS week's matchup -- weekly
  # figures only (Redraft/Best Ball floor/median/ceiling). Season sims
  # and playoff_ceiling stay untouched, same reasoning as the OUT
  # override: a season total or a weeks-15-17 figure isn't tied to one
  # matchup. Fails safe: if unavailable, every multiplier is effectively
  # 1 (no adjustment) rather than erroring.
  matchup_mult <- tryCatch(compute_matchup_multipliers(), error = function(e) {
    cat("Matchup data unavailable this run -- skipping opponent-strength adjustment:",
        conditionMessage(e), "\n")
    NULL
  })

  # Avg Separation / YAC Above Expectation (WR/TE stat_ranges, added below)
  # -- real Next Gen Stats PER-GAME history (week != 0; week == 0 is NGS's
  # own season-aggregate row, not usable as a resampling pool), same
  # `seasons` lookback window as `reg` above. Bootstrap-resampled per
  # player in the loop below using NGS_DECAY/NGS_FLOOR_Q/NGS_CEIL_Q (see
  # their definitions up top) for a genuine floor/median/ceiling, not a
  # flat point value -- backtested via backtest_ngs_receiving_decay.R +
  # calibrate_ngs_receiving_quantiles.R. Fails safe: if NGS is
  # unavailable, stays NULL and the per-player loop leaves both stats out
  # entirely rather than erroring.
  ngs_receiving_hist <- tryCatch({
    ngs <- as.data.frame(load_nextgen_stats(stat_type = "receiving", seasons = seasons))
    ngs[ngs$week != 0 & ngs$season_type == "REG", c("player_gsis_id", "season", "week",
                                                      "avg_separation", "avg_yac_above_expectation")]
  }, error = function(e) {
    cat("NGS receiving data unavailable this run -- skipping avg separation/YAC above expectation:",
        conditionMessage(e), "\n")
    NULL
  })

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
    avail <- player_availability(d, target_season, completed_weeks)

    idx <- seq_len(n)
    relevant_stats <- STAT_COLS_BY_POSITION[[pos]]

    # Season fantasy-points total: unchanged mechanism from before --
    # samples GAME INDICES (not points values directly), resampled with
    # the single position-level MED_DECAY (wm), matching Redraft/Best
    # Ball's own recency weighting. Powers season_floor/median/ceiling
    # and the boom/bust profile only; NOT part of the stat-group split
    # below (that backtest targeted the granular per-stat columns, not
    # the blended points total).
    szn <- replicate(n_sims, {
      g <- sum(runif(MAX_GAMES_PER_SEASON) < avail)
      if (g == 0) 0 else sum(x[sample(idx, g, replace = TRUE, prob = wm)])
    })

    # Boom/bust profile: share of simulated seasons landing 20%+ below vs.
    # above THIS PLAYER'S OWN median (not a fixed league-wide point
    # threshold, which would need constant recalibration as scoring
    # environments shift). Answers "how spiky is this range" in a way
    # floor/median/ceiling alone can't -- two players can share the same
    # three numbers while one is a steady workhorse and the other a
    # week-to-week coin flip.
    szn_med <- as.numeric(quantile(szn, 0.50))
    bust_pct <- round(100 * mean(szn < 0.8 * szn_med))
    boom_pct <- round(100 * mean(szn > 1.2 * szn_med))
    normal_pct <- 100 - bust_pct - boom_pct

    # Granular per-stat season projections: each stat-group (touchdown/
    # interception vs. yardage/volume, STAT_GROUP_BY_STAT) gets its own
    # resampling pass with its own backtested decay and calibrated
    # floor/ceiling quantile (STAT_GROUP_DECAY/FLOOR_Q/CEIL_Q above) --
    # correlation is preserved WITHIN a group (a big rushing-yards game
    # and a big receiving-yards game still come from the same simulated
    # draw, both in "yardage") but NOT across groups (that same game's
    # rushing-TD total is now drawn separately, under "td_int"'s own
    # weighting) -- an unavoidable consequence of the two stat types
    # needing genuinely different recency weighting; see
    # backtest_stat_group_decay.R. Not shrink-blended, matching the
    # existing season_floor/median/ceiling precedent (season totals rely
    # on the availability dampening above, not the low-sample blend that
    # only applies to weekly figures). For interceptions, "ceiling" is
    # the 90th-ish percentile of INTs thrown, i.e. the worst case, not
    # "best" -- left as a plain range, not a good/bad framing, same as
    # before.
    stat_ranges <- list()
    if (!is.null(relevant_stats)) {
      stat_groups_present <- split(relevant_stats, STAT_GROUP_BY_STAT[relevant_stats])
      for (group_name in names(stat_groups_present)) {
        cols <- stat_groups_present[[group_name]]
        w_group <- recency_weights(n, STAT_GROUP_DECAY[[group_name]][pos])
        floor_q <- STAT_GROUP_FLOOR_Q[[group_name]][pos]
        ceil_q  <- STAT_GROUP_CEIL_Q[[group_name]][pos]

        group_sim <- replicate(n_sims, {
          g <- sum(runif(MAX_GAMES_PER_SEASON) < avail)
          if (g == 0) setNames(rep(0, length(cols)), cols)
          else {
            sampled <- sample(idx, g, replace = TRUE, prob = w_group)
            sapply(cols, function(col) sum(d[[col]][sampled]))
          }
        })
        # replicate() drops the row dimension when length(cols) == 1
        # (a WR/TE's td_int group is just receiving_tds) -- normalize
        # back to a 1-row matrix so `group_sim[col, ]` always works.
        if (is.null(dim(group_sim))) {
          group_sim <- matrix(group_sim, nrow = 1, dimnames = list(cols, NULL))
        }

        for (col in cols) {
          v <- group_sim[col, ]
          stat_ranges[[col]] <- list(
            floor = round(as.numeric(quantile(v, floor_q)), 0),
            median = round(as.numeric(quantile(v, 0.50)), 0),
            ceiling = round(as.numeric(quantile(v, ceil_q)), 0)
          )
        }
      }
      stat_ranges <- stat_ranges[relevant_stats]  # restore STAT_COLS_BY_POSITION's column order
    }

    # Avg Separation / YAC Above Expectation (WR/TE only) -- appended AFTER
    # the relevant_stats reindex above so they aren't dropped by it, since
    # neither key is one of STAT_COLS_BY_POSITION's stat-group columns.
    # Bootstrap-resamples the player's own NGS per-game history (recency-
    # weighted, same `avail`-driven games-played model as every other
    # season sim on this page) and takes the MEAN of each simulated
    # season's games -- these are rate stats, not counting stats, so a
    # season "total" wouldn't mean anything the way it does for yards/TDs.
    # NGS_DECAY/FLOOR_Q/CEIL_Q are backtested per (position, metric) --
    # see their definitions up top. Genuinely different floor/median/
    # ceiling now, not the same value three times.
    if (pos %in% c("WR", "TE") && !is.null(ngs_receiving_hist)) {
      pid <- d$player_id[1]
      player_ngs <- ngs_receiving_hist[ngs_receiving_hist$player_gsis_id == pid, ]
      player_ngs <- player_ngs[order(player_ngs$season, player_ngs$week), ]
      n_ngs <- nrow(player_ngs)
      if (n_ngs >= NGS_MIN_GAMES) {
        ngs_idx <- seq_len(n_ngs)
        for (metric in c("avg_separation", "yac_above_exp")) {
          src_col <- if (metric == "avg_separation") "avg_separation" else "avg_yac_above_expectation"
          vals <- player_ngs[[src_col]]
          if (all(is.na(vals))) next
          w_ngs <- recency_weights(n_ngs, NGS_DECAY[[pos]][[metric]])
          sim <- replicate(n_sims, {
            g <- sum(runif(MAX_GAMES_PER_SEASON) < avail)
            if (g == 0) NA_real_ else mean(sample(vals, g, replace = TRUE, prob = w_ngs))
          })
          sim <- sim[!is.na(sim)]
          if (length(sim) < 100) next  # too few valid draws (very low availability) to trust the quantiles
          decimals <- if (metric == "avg_separation") 1 else 2
          stat_ranges[[metric]] <- list(
            floor = round(as.numeric(quantile(sim, NGS_FLOOR_Q[[pos]][[metric]])), decimals),
            median = round(as.numeric(quantile(sim, 0.50)), decimals),
            ceiling = round(as.numeric(quantile(sim, NGS_CEIL_Q[[pos]][[metric]])), decimals)
          )
        }
      }
    }

    playoff <- replicate(n_sims, sum(sample(x, 3, replace = TRUE, prob = wc)))

    shrink_this_player <- p %in% shrink_players && !is.null(baseline_pools[[pos]])
    if (shrink_this_player) {
      base <- baseline_pools[[pos]]
      fl  <- shrunk_quantile(x, wm, base$pool, base$weights, FLOOR_Q[pos])
      med <- shrunk_quantile(x, wm, base$pool, base$weights, 0.50)
      cei <- shrunk_quantile(x, wc, base$pool, base$weights, CEIL_Q[pos])
    } else {
      fl  <- weighted_quantile(x, wm, FLOOR_Q[pos])
      med <- weighted_quantile(x, wm, 0.50)
      cei <- weighted_quantile(x, wc, CEIL_Q[pos])
    }

    # Trend: last-4-games simple average vs. the weighted median baseline
    # above, +/-10% band. Same comparison that caught Aaron Jones/Kamara's
    # decline and RJ Harvey's Dobbins-driven spike earlier this session,
    # now surfaced as its own tag rather than something found by hand.
    recent4 <- mean(tail(x, 4))
    trend <- if (med <= 0) {
      "STEADY"
    } else if (recent4 > med * 1.10) {
      "RISING"
    } else if (recent4 < med * 0.90) {
      "FALLING"
    } else {
      "STEADY"
    }

    opp <- week_opponent[team]
    opp <- if (length(opp) == 1 && !is.na(opp)) unname(opp) else NA_character_

    mult <- 1  # neutral by default; overwritten below when matchup data covers this opponent+position
    if (!is.null(matchup_mult) && !is.na(opp)) {
      mult_key <- paste(opp, pos)
      if (mult_key %in% names(matchup_mult)) {
        mult <- matchup_mult[[mult_key]]
        fl  <- fl * mult
        med <- med * mult
        cei <- cei * mult
      }
    }

    # Weekly per-stat MEANS (raw components -- receptions, yards, TDs,
    # INTs), same weighting/shrinkage/matchup-mult treatment as `med`
    # above, just one column at a time instead of the blended
    # fantasy_points_ppr total -- and mean rather than median, see
    # weighted_mean()'s comment for why median silently loses touchdown
    # value here. Powers Redraft's custom scoring settings: the frontend
    # recomputes a fantasy-point total from these raw components under
    # the user's own PPR/TE-premium/passing-TD/INT choices, rather than
    # being stuck with the single fixed-scoring `median` baked in here.
    relevant_weekly_stats <- STAT_COLS_BY_POSITION[[pos]]
    weekly_scoring_stats <- if (!is.null(relevant_weekly_stats)) {
      setNames(lapply(relevant_weekly_stats, function(col) {
        col_x <- d[[col]]
        stat_val <- if (shrink_this_player && !is.null(stat_pools[[pos]][[col]])) {
          base <- stat_pools[[pos]][[col]]
          shrunk_mean(col_x, wm, base$pool, base$weights)
        } else {
          weighted_mean(col_x, wm)
        }
        round(stat_val * mult, 2)
      }), relevant_weekly_stats)
    } else {
      list()
    }
    weekly_scoring_stats_json <- jsonlite::toJSON(weekly_scoring_stats, auto_unbox = TRUE)

    # WOPR/EPA: projected forward the same way every other rate stat on
    # this page is -- own backtested recency weights (WOPR_DECAY/
    # EPA_DECAY, not wm/MED_DECAY -- see the comment by their definition),
    # shrunk toward a positional baseline pool for the same shrink-eligible
    # players (thin sample / long absence / team change) as
    # weekly_scoring_stats above. This is a projection of the player's
    # usage/efficiency going into the target season, not a raw historical
    # average -- matches the site's existing definition of "projection"
    # for rate stats (see weighted_mean()'s comment on weekly_scoring_stats).
    epa_component <- d$epa_component
    w_epa <- recency_weights(n, EPA_DECAY[pos])
    if (pos != "QB") {
      w_wopr <- recency_weights(n, WOPR_DECAY[pos])
      wopr_val <- if (shrink_this_player && !is.null(stat_pools[[pos]][["wopr"]])) {
        base <- stat_pools[[pos]][["wopr"]]
        round(shrunk_mean(d$wopr, w_wopr, base$pool, base$weights), 3)
      } else {
        round(weighted_mean(d$wopr, w_wopr), 3)
      }
    } else {
      wopr_val <- NA_real_
    }
    epa_val <- if (shrink_this_player && !is.null(stat_pools[[pos]][["epa_component"]])) {
      base <- stat_pools[[pos]][["epa_component"]]
      round(shrunk_mean(epa_component, w_epa, base$pool, base$weights), 2)
    } else {
      round(weighted_mean(epa_component, w_epa), 2)
    }

    rows[[p]] <- data.frame(
      player_name = p, position = pos, team = team, opponent = opp, games = n,
      touches_per_game = round(mean(d$touches), 1),
      availability_pct = round(100 * avail, 0),
      shrunk = shrink_this_player,
      trend = trend,
      matchup_mult = round(mult, 2),
      floor = round(fl, 1),
      median = round(med, 1),
      ceiling = round(cei, 1),
      weekly_scoring_stats_json = weekly_scoring_stats_json,
      # Season floor/ceiling use plain 10th/90th percentile of the 30,000-draw
      # simulated distribution directly -- NOT the calibrated FLOOR_Q/CEIL_Q,
      # which correct for small-sample bias in a *historical* game log. The
      # season sim doesn't have that problem; it's already a large Monte
      # Carlo sample, so a plain empirical quantile is the right tool here.
      season_floor = round(quantile(szn, 0.10), 0),
      season_median = round(quantile(szn, 0.50), 0),
      season_ceiling = round(quantile(szn, 0.90), 0),
      bust_pct = bust_pct,
      normal_pct = normal_pct,
      boom_pct = boom_pct,
      wopr = wopr_val,
      epa = epa_val,
      playoff_ceiling = round(quantile(playoff, CEIL_Q[pos]), 1),
      # Granular per-stat floor/median/ceiling (passing/rushing/receiving
      # yards & TDs, INTs, receptions -- position-dependent, see
      # STAT_COLS_BY_POSITION), serialized to JSON for a single jsonb
      # column rather than ~24 sparse numeric columns most rows wouldn't use.
      stat_ranges_json = jsonlite::toJSON(stat_ranges, auto_unbox = TRUE)
    )
  }
  out <- do.call(rbind, rows)
  attr(out, "publish_week") <- publish_week
  out
}

# ============================= SUPABASE EXPORT =============================
# Reshapes project_all()'s output into the three CSVs each table actually
# expects (see web/csv-upload-formats.html for the canonical column specs).
# `week` defaults to whatever project_all() resolved by date (its
# `publish_week` attribute) -- no more manually bumping a counter each
# time you republish. Pass an explicit `week` to override (e.g.
# backfilling a past week).
export_for_supabase <- function(df, target_season = TARGET_SEASON, week = NULL) {
  season <- target_season
  if (is.null(week)) {
    week <- attr(df, "publish_week")
    if (is.null(week)) week <- current_nfl_week(season)
  }
  confidence <- ifelse(df$shrunk, "building", "established")

  # Official "Out" designations for this week -- weekly projection/ceiling
  # goes to 0 and it sorts to the bottom of its position group, rather than
  # keeping stale rank with a 0 next to it. Season-total figures
  # (player_simulations, below) are untouched -- one missed week doesn't
  # change a season projection. playoff_ceiling is also untouched here --
  # it's a weeks-15-17 figure, unrelated to this week's status.
  out_players <- tryCatch(load_out_players(season, week), error = function(e) {
    cat("Injury report unavailable this run -- skipping OUT overrides:", conditionMessage(e), "\n")
    character(0)
  })
  is_out <- df$player_name %in% out_players
  if (length(out_players) > 0) {
    cat("OUT this week (projection/ceiling set to 0):", sum(is_out), "player(s) -",
        paste(df$player_name[is_out], collapse = ", "), "\n")
  }
  df$median <- ifelse(is_out, 0, df$median)
  df$ceiling <- ifelse(is_out, 0, df$ceiling)

  redraft <- df[order(-df$median), ]
  # OUT players get their fixed-scoring projection zeroed above -- the raw
  # component stats that power custom scoring need the same override,
  # otherwise a user's own PPR/TD/INT settings would reconstruct a
  # nonzero point total for a player the site otherwise shows as 0.
  redraft_scoring_stats <- ifelse(redraft$player_name %in% out_players, "{}", redraft$weekly_scoring_stats_json)
  write.csv(data.frame(
    season = season, week = week, rank = seq_len(nrow(redraft)),
    player_name = redraft$player_name, position = redraft$position,
    team = redraft$team, opponent = redraft$opponent, projection = redraft$median,
    matchup_mult = redraft$matchup_mult,
    trend = redraft$trend,
    sample_confidence = ifelse(redraft$shrunk, "building", "established"),
    scoring_stats = redraft_scoring_stats,
    notes = ifelse(redraft$player_name %in% out_players, "OUT", "")
  ), "upload_redraft_rankings.csv", row.names = FALSE)

  # ceiling_range_low / ceiling_probability are NOT written here -- they're
  # computed separately by ceiling_range.R (reads this same CSV, adds those
  # two columns, writes upload_ceiling_range.csv), then published as a
  # second PATCH pass. Keeping that logic in one place rather than
  # duplicating it here.
  bb <- df[order(-df$ceiling), ]
  write.csv(data.frame(
    season = season, week = week, rank = seq_len(nrow(bb)),
    player_name = bb$player_name, position = bb$position, team = bb$team,
    opponent = bb$opponent, ceiling_score = round(bb$ceiling),
    matchup_mult = bb$matchup_mult,
    playoff_ceiling_score = round(bb$playoff_ceiling),
    trend = bb$trend,
    sample_confidence = ifelse(bb$shrunk, "building", "established"),
    notes = ifelse(bb$player_name %in% out_players, "OUT", "")
  ), "upload_best_ball_rankings.csv", row.names = FALSE)

  write.csv(data.frame(
    season = season, week = week, player_name = df$player_name, position = df$position,
    team = df$team, floor = df$season_floor, median = df$season_median,
    ceiling = df$season_ceiling,
    trend = df$trend,
    sample_confidence = confidence,
    stat_ranges = df$stat_ranges_json,
    bust_pct = df$bust_pct, normal_pct = df$normal_pct, boom_pct = df$boom_pct,
    wopr = df$wopr, epa = df$epa,
    notes = ""
  ), "upload_player_simulations.csv", row.names = FALSE, na = "")

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
