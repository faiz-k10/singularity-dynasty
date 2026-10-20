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

# Player Season Simulations' own pool is capped to the top N players by
# season median (overall, not per-position) -- explicit product decision,
# not backtested. Every per-stat percentile on that page (radar, percentile
# card, heat-tint, Similar Shape) is computed against whatever's actually
# published, so trimming the long replacement-level tail out of the pool
# makes those percentiles reflect a real startable-caliber universe
# instead of being padded by waiver-wire players nobody would ever roster.
# Does NOT affect redraft_rankings or best_ball_rankings, which stay
# uncapped -- this is specific to the simulation pool.
PLAYER_SIMULATIONS_POOL_SIZE <- 300

MIN_GAMES <- 6    # eligibility floor -- below this, a player isn't projected at
                  # all. Below LOW_SAMPLE_SHRINK_THRESHOLD (20) but above this,
                  # a player is still projected purely off their own history, just
                  # labeled "building" confidence (sample_confidence) rather than
                  # "established" -- see LOW_SAMPLE_SHRINK_THRESHOLD's own comment
                  # for why the pool-blend that name used to imply is gone.
                  # NOTE: the walk-forward backtest above validated 8, not 6 --
                  # lowered by direct product decision to let a promising rookie
                  # (Shedeur Sanders, 7 games) clear the floor instead of getting
                  # excluded entirely. Verified impact before lowering: only 7
                  # total players newly eligible, 6 of them deep-bench/shrink-
                  # heavy (sub-3 median) and functionally irrelevant -- Sanders
                  # was the only meaningful addition.

QB_SHORT_MIN_GAMES <- 3  # a top-2 depth-chart QB needs only this many games
                        # (see project_all()), so an OUT starter's backup can be
                        # promoted even before he reaches MIN_GAMES.

MED_DECAY   <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)  # Redraft Rankings
CEIL_DECAY  <- c(RB = 0.89, QB = 0.98, WR = 0.93, TE = 0.91)  # Best Ball Rankings
CEIL_Q      <- c(RB = 0.995, QB = 0.985, WR = 0.975, TE = 0.995)  # calibrated internal quantile for "ceiling" --
                  # re-swept via backtest_ceiling_calibration.R after real 2026
                  # Weeks 1-3 data showed the old values (0.94-0.96) were never
                  # actually validated by any backtest and produced a real
                  # above-ceiling rate roughly DOUBLE their own intended target
                  # (e.g. QB: literal 0.96 implies ~4% real exceed rate, actually
                  # produced ~6.5%; RB/TE ran closer to ~9%) -- confirmed on both
                  # the 2022-2025 walk-forward AND live 2026 Weeks 1-3 actuals.
                  # These new values were sourced by sweeping for whichever
                  # internal quantile makes the REAL exceed rate land at the
                  # ORIGINAL values' own intended target (4% QB/RB/TE, 6% WR) --
                  # same calibration-lever concept STAT_GROUP_FLOOR_Q/CEIL_Q's
                  # comment already describes for Season Sims, just never
                  # applied here until now. CEIL_DECAY untouched.
FLOOR_Q     <- c(RB = 0.09, QB = 0.08, WR = 0.12, TE = 0.13)  # calibrated internal quantile for "floor"

# Player Season Simulations' season_floor/season_ceiling internal
# quantile -- separate from FLOOR_Q/CEIL_Q above (those are the WEEKLY
# Redraft/Best Ball numbers). Calibrated via backtest_season_calibration.R
# the same way CEIL_Q above was: sweeping for whichever quantile makes the
# REAL walk-forward exceed rate (against actual 2022-2025 season totals)
# land at the intended 10%/10%, replacing a literal, never-validated
# 0.10/0.90 that a prior comment here incorrectly argued didn't need
# calibration ("it's already a large Monte Carlo sample" -- true for
# reducing estimation NOISE, doesn't fix BIAS if the resampled
# distribution itself understates real season-to-season volatility, which
# it did: real below/above rates were running 22-34%/17-20% before this).
# RB floor is the one position that doesn't fully close even at the
# sweep's lower bound (0.010 -> 14.2% real rate, vs. 10% target) -- going
# lower risks the ~1st-percentile draw out of N_SIMS becoming unstably
# noisy rather than closing the gap further; flagged, not chased past
# that point. season_median stays a plain 0.50 -- only the two tails were
# ever the problem.
SEASON_FLOOR_Q <- c(RB = 0.010, QB = 0.020, WR = 0.010, TE = 0.020)
SEASON_CEIL_Q  <- c(RB = 0.995, QB = 0.985, WR = 0.990, TE = 0.990)

# Banked season totals (Player Season Simulations floor/median/ceiling and the
# per-stat ranges). ON by default; set BANK_SEASON_TOTALS=0 in the environment to
# fall back to the old fresh-16-game-season simulation.
# When on, once a season is underway each player's real totals so far are locked
# in and the existing bootstrap only simulates the games his team has LEFT
# (MAX_GAMES_PER_SEASON minus its games played), instead of redrawing a whole
# fresh 16-game season that ignores the games already played. Preseason (no
# games yet) it changes nothing. The floor/ceiling cutoffs above are unchanged
# and still tuned for a full season -- recalibrating them by games remaining is
# a separate step.
BANK_SEASON_TOTALS <- identical(Sys.getenv("BANK_SEASON_TOTALS", "1"), "1")

# Floor/ceiling in banked mode: a distance from the published median with the shape of
# a healthy player's range (runs where he plays >= BANKED_HEALTHY_SHARE of his team's
# remaining games), stretched by factors fitted in analyze_banked_calibration.R so that
# about 10% of players who stayed on the field land at or below the floor / at or above
# the ceiling (checked out of sample). The MEDIAN follows the same logic (changed Oct 2026, at
# the founder's direction): it is the median of the simulation in which he plays every remaining
# game, and the floor and ceiling are distances from it, so no number assumes he misses games he
# has not missed yet. A player who actually misses games is handled the usual way -- those games
# are banked and the next weekly run lowers his numbers; nothing prices in a lost season in
# advance. (Before this change the median was the median of ALL runs, injury history included;
# that version ranked injury-prone players lower and was slightly more accurate on real totals,
# see the README.) Because floor and ceiling are distances from the median, they cannot cross it.
BANKED_HEALTHY_SHARE <- 0.75
BANKED_COUNT_STATS <- c("passing_tds", "passing_interceptions", "rushing_tds", "receiving_tds")
if (file.exists("banked_k_table.R")) source("banked_k_table.R")
source("rec_td_blend.R")   # WR/TE weekly receiving-TD figure (75% expected TDs + 25% slow actual); see its header

# Sums of `g[i]` weighted bootstrap draws of each column of `vals`, for every run i.
bank_sim_sums <- function(vals, w, g) {
  out <- matrix(0, nrow = length(g), ncol = ncol(vals))
  total <- sum(g)
  if (total == 0) return(out)
  idx <- sample.int(nrow(vals), total, replace = TRUE, prob = w)
  s <- rowsum(vals[idx, , drop = FALSE], rep.int(seq_along(g), g))
  out[as.integer(rownames(s)), ] <- s
  out
}

# k_lo / k_hi for a position + stat at `games_left`, interpolated across the as-of weeks
# the backtest covered (clamped at the ends).
banked_k <- function(pos, stat, games_left) {
  if (!exists("BANKED_K")) stop("BANK_SEASON_TOTALS is on but banked_k_table.R was not found next to projection_engine.R")
  t <- BANKED_K[BANKED_K$pos == pos & BANKED_K$stat == stat, ]
  if (nrow(t) == 0) {
    cat("banked_k: no calibration for", pos, stat, "-- using k = 1\n")
    return(list(lo = 1, hi = 1))
  }
  t <- t[order(t$games_left), ]
  list(lo = approx(t$games_left, t$k_lo, xout = games_left, rule = 2)$y,
       hi = approx(t$games_left, t$k_hi, xout = games_left, rule = 2)$y)
}

# floor / median / ceiling for one stat: `banked` is what he has already done, `rem` the
# simulated remaining-games totals (one per run), `healthy` which runs kept him on the field.
bank_band <- function(pos, stat, banked, rem, healthy, games_left, rem_full) {
  if (games_left <= 0) return(c(floor = round(banked), median = round(banked), ceiling = round(banked)))
  k <- banked_k(pos, stat, games_left)
  h <- rem[healthy]
  h_med <- as.numeric(quantile(h, 0.50))
  # The median (and the floor/ceiling anchored on it) assumes he plays EVERY remaining game: `rem_full` is the same
  # simulation with no games missed. Games he actually misses are banked and lower the numbers at the next run.
  # The width of the range still comes from the stays-on-the-field runs (`healthy`).
  med <- as.numeric(quantile(rem_full, 0.50))
  unit <- if (stat %in% BANKED_COUNT_STATS) 1 else 0   # whole-number stats need at least a unit of spread to stretch
  lo_w <- max(h_med - as.numeric(quantile(h, 0.10)), unit)
  hi_w <- max(as.numeric(quantile(h, 0.90)) - h_med, unit)
  m <- round(banked + med)
  c(floor = min(round(banked + max(med - k$lo * lo_w, 0)), m),
    median = m,
    ceiling = max(round(banked + med + k$hi * hi_w), m))
}

# Sleeper-blend weekly median: blends OUR weighted-quantile median with
# Sleeper's own published weekly projection, per position. Validated via
# backtest_vs_sleeper.R -- real head-to-head, 7,853 player-weeks across
# 2024-2025 (both completed seasons, weeks 3-17), scored by MAE against
# real outcomes:
#
#   w (ours)   QB MAE   RB MAE   WR MAE   TE MAE   OVERALL
#   0.0 (pure Sleeper)  6.655    4.406    4.530    3.664    4.530
#   best per position   6.378    4.385    4.482    3.632      --
#   1.0 (pure ours)     6.666    4.659    4.628    3.765    4.661
#
# Blending wins outright -- every weight from 0.1 to 0.7 beat pure
# Sleeper on overall MAE, and pure Sleeper alone already beat pure "ours"
# at every position. Best weight differs meaningfully by position (RB
# wants very little of our own signal, QB nearly even), so this is
# applied per position, not one flat constant.
#
# CAVEAT worth keeping honest: the backtest's "yours" is the pure
# weighted-quantile median, NOT the actual currently-published median
# (which already includes the 85/15 debias blend two paragraphs down).
# The two corrections may partially overlap -- both exist to fix the
# same right-skew low-bias problem, one by blending toward the mean, the
# other by blending toward Sleeper's own (more expected-value-like)
# numbers. This wasn't re-validated as a combined stack; it's the best
# available real evidence, applied honestly, not a claim the exact
# combined weight is itself optimal.
SLEEPER_BLEND_WEIGHT <- c(QB = 0.5, RB = 0.2, WR = 0.4, TE = 0.4)  # weight on OUR OWN number
APPLY_SLEEPER_BLEND <- TRUE  # unlike APPLY_MATCHUP_MULTIPLIER, this IS
                              # walk-forward validated across two full
                              # real seasons -- on by default.

# Sleeper omits its projection for any player it knows is out (inactive/
# injured) -- checked against real 2026 data: of 45 players this model had
# at >=5 pts that Sleeper had no projection for (Weeks 1-2), 44 recorded
# zero snaps. The blend above silently fell back to 100% our own number for
# them, which is how Nico Collins/Josh Jacobs/Kyler Murray etc. went out at
# 13-17 pts in Week 2 while nflreadr's injury report (load_out_players)
# missed them. This treats "Sleeper has no projection AND our own median is
# >= SLEEPER_MISSING_OUT_MIN" as OUT too, same zero-projection/"OUT"-note
# handling as an official designation. Guarded: needs a healthy Sleeper
# payload (>= SLEEPER_MISSING_OUT_MIN_PAYLOAD entries) so a truncated fetch
# can't zero out the whole slate. Set FALSE to disable.
APPLY_SLEEPER_MISSING_OUT <- TRUE
SLEEPER_MISSING_OUT_MIN <- 3
SLEEPER_MISSING_OUT_MIN_PAYLOAD <- 150

# Sleeper's join-name normalization -- their player dictionary drops name
# suffixes ("Luther Burden" instead of "Luther Burden III"); this model's
# own names (from nflreadr) keep them, same mismatch web/app/my-team/
# actions.js's normalizeName() and backtest_vs_sleeper.R's
# normalize_join_name() already handle on their own sides.
normalize_sleeper_name <- function(name) {
  tolower(gsub("\\s+(jr|sr|ii|iii|iv|v)$", "", gsub("\\.", "", name), ignore.case = TRUE))
}

# Fetches Sleeper's own published weekly PPR projection for every
# QB/RB/WR/TE, keyed by "normalized name|position" so it joins the same
# way every other cross-source lookup in this file does. jsonlite::
# fromJSON() fetches directly from the URL -- no httr dependency needed,
# same approach backtest_vs_sleeper.R validated this data source with.
# Sleeper's projections payload embeds each entry's player name directly
# (no separate 16MB player-dictionary fetch required). Returns NULL (not
# an error) on any failure -- fails safe to "no blend this run" exactly
# like compute_matchup_multipliers() does.
fetch_sleeper_median_projections <- function(season, week) {
  positions <- c("QB", "RB", "WR", "TE")
  params <- paste(sapply(positions, function(p) paste0("position[]=", p)), collapse = "&")
  url <- sprintf("https://api.sleeper.app/projections/nfl/%d/%d?season_type=regular&%s", season, week, params)
  data <- tryCatch(jsonlite::fromJSON(url, simplifyDataFrame = FALSE), error = function(e) NULL)
  if (is.null(data) || length(data) == 0) return(NULL)
  out <- lapply(data, function(e) {
    # The entry's own top-level `position` field is blank on these
    # payloads (confirmed by hand against live data) -- the real
    # position lives under `player$position`. Caught by testing this
    # function against live Week 2 2026 data before trusting it: the
    # top-level field silently produced zero matches even though the
    # payload had real projections for every player.
    pos <- e$player$position
    if (is.null(e$player) || is.null(pos) || is.null(e$stats) || is.null(e$stats$pts_ppr)) return(NULL)
    if (!(pos %in% positions)) return(NULL)
    name <- paste(e$player$first_name, e$player$last_name)
    list(key = paste0(normalize_sleeper_name(name), "|", pos), pts_ppr = e$stats$pts_ppr)
  })
  out <- out[!sapply(out, is.null)]
  if (length(out) == 0) return(NULL)
  setNames(sapply(out, `[[`, "pts_ppr"), sapply(out, `[[`, "key"))
}

# RB/WR/TE weekly median (Redraft) point estimate: 85% weighted quantile-
# median + 15% weighted mean, instead of the pure quantile-median.
# Non-Vegas bias fix -- backtest_debias_blend.R swept the mix on the same
# ~7,850-real-player-week Sleeper head-to-head harness as
# backtest_mean_vs_median.R. Pure median (share = 1.00) leaves the model
# biased low by ~0.98 pts/week at all three positions; a full switch to
# mean (share = 0.00, backtest_mean_vs_median.R) fixes the bias but costs
# MAE and MedAE. share = 0.85 is the corner: MAE flat-to-better (RB
# 4.637 -> 4.626, WR/TE within 0.005), RMSE better at all three (~-0.5%),
# within-week rank correlation slightly better, and bias roughly halved
# (-0.98 -> -0.81). QB is unaffected -- it already reports a full mean
# (see the pos == "QB" branch below), its own validated exception.
MED_MEAN_BLEND_SHARE <- 0.85

# Bounce-back trigger: a player whose most recent real game (week-18
# excluded, see EXCLUDE_WEEKS) landed AT OR BELOW their own published
# FLOOR_Q -- the same calibrated per-position quantile `fl` (this week's
# floor) is built from, not a separate constant -- so the badge means
# exactly what it says: "this game was at or below the number we call
# his floor." Explicit product choice: an exceptionally bad game (below
# floor, not merely a below-average one) is the trigger worth flagging as
# "due for a bounce back to baseline," and tying it to the same published
# number keeps the two internally consistent.
#
# Was previously a flat 0.20 (bottom-20th-percentile) for every position,
# picked from a real descriptive backtest (every player-season 2018-2025,
# min 10 games, ~5,300 bottom-20th-percentile trigger events tracked
# forward: real players average somewhat above the 50th percentile next
# game and repeat bottom-20% only 12-16% of the time, vs. exactly
# 50th/20% for a true no-memory process -- real, if modest, mean
# reversion). That same backtest also checked a tighter bottom-10th-
# percentile trigger -- close to FLOOR_Q's ~8-13% range -- and found
# almost identical aggregate reversion (a more extreme bad week does NOT
# predict a bigger bounce, in aggregate), so switching to FLOOR_Q isn't
# stepping into the completely untested: see README's "Bounce-back
# trigger" section for the full per-position breakdown at that tighter
# threshold, including its one real divergence -- QB's reversion fades/
# inverts at the tighter cutoff (n=212, smaller sample) where it holds up
# fine for RB/WR/TE. Still, FLOOR_Q as the literal trigger wasn't the
# exact quantile re-run, and it's informational only either way (see
# next paragraph) -- the stakes of that gap are "which games get the
# badge," not model accuracy.
#
# Originally the plan was ALSO to pull the player's median from a
# slightly higher internal quantile next week (BOUNCEBACK_MED_Q below)
# instead of the flat 0.50 every other player gets -- backtest_
# bounceback_validation.R walk-forward tested whether ACTING on the
# reversion pattern (shifting the point prediction, not just observing
# it) reduces next-game MAE, and it doesn't: +0.7% worse overall, +3.0%
# worse on exactly the games it changes (up to +4.2% for QB). A real
# average-case pattern doesn't automatically mean nudging every triggered
# player's single-point prediction helps -- the players who don't bounce
# back apparently lose more accuracy than the players who do gain.
# BOUNCEBACK_MED_Q is therefore NOT applied to the projection (med_q
# below stays 0.50 always) -- had_bad_week is still computed and exported
# as `bounceback` purely as information (same "surface it, don't act on
# it" pattern `trend` already uses). Trigger threshold is computed
# leave-one-out (the flagged game itself is excluded from its own
# reference distribution) to avoid a game defining its own bar -- same
# zero-lookahead discipline as every walk-forward backtest in this file.
BOUNCEBACK_MED_Q <- c(RB = 0.529, QB = 0.556, WR = 0.548, TE = 0.556)  # not applied -- see above

# QB weekly median: passing/rushing split, NOT a blended single-decay
# bootstrap like every other position gets. Motivated directly by this
# file's own admission that QB is the position with the least
# confidence behind its tuning ("QB's ceiling decay barely matters...
# don't over-trust QB=0.98 as precisely correct" -- see Recency
# weighting above). QB fantasy output is also genuinely bimodal in a way
# no other position's blended total is (a pure pocket passer vs. a real
# rushing threat), which a single MED_DECAY on the combined total can't
# represent.
#
# Decay values walk-forward validated in backtest_qb_pass_rush_split.R,
# next-game MAE (same target/methodology as MED_DECAY's own original
# backtest): sweeping each component's decay independently beats the
# single blended MED_DECAY["QB"]=0.90 on the combined total. Passing
# wants much faster decay (0.79) than the blended value implied --
# passing volume/efficiency apparently shifts within a season faster
# than one blended number can track. Rushing's own optimum (0.88) is
# close to the blended value, meaning rushing was never really the
# mismatched half of QB scoring -- passing was.
#
# The combining step (how pass/rush become one QB number) went through
# three real iterations, in order, each one backtested rather than
# assumed:
#   1. Sum of two weighted MEANS -- worked (-0.68% MAE vs. blended),
#      but inconsistent with every other position's median meaning a
#      literal percentile of a distribution.
#   2. Corrected to the 0.50 QUANTILE of n_sims independently-resampled
#      (pass draw + rush draw) sums instead -- fixed the consistency
#      issue AND won by more, not less (-1.07% vs. attempt 1's -0.68%).
#   3. Real head-to-head against Sleeper's own published projections
#      (2024-2025, ~800 real QB weeks, backtest_mean_vs_median.R) found
#      QB's quantile-based number biased low by -0.94 points on average
#      against real outcomes -- expected for a right-skewed stat (mean
#      sits above median for skewed data), and Sleeper's numbers behave
#      like an expected-value forecast, not a literal median. Switching
#      back to attempt 1's MEAN -- this time as a deliberate, evidenced
#      choice, not the unconsidered first draft -- won on every measure
#      tested against Sleeper: MAE, RMSE, MedAE, bias (-0.94 -> -0.55),
#      AND rank correlation. Not a tradeoff, a clean win.
#
# RB/WR/TE were tested the identical way against Sleeper and did NOT
# win cleanly switching to mean (bias/RMSE improved, but MAE/MedAE got
# measurably worse -- a real tradeoff, not obviously a win), so they
# deliberately stay on the quantile-median path everywhere else in this
# file. QB's own "median" field is therefore not literally a median for
# this one position -- accept that naming reality rather than hide it.
#
# Scoped to the median only, still. Floor/ceiling keep the single
# blended-distribution weighted_quantile approach -- neither backtest
# above tested a floor/ceiling spread, and stacking an unvalidated
# change onto FLOOR_Q/CEIL_Q's own separate calibration isn't something
# this file does without evidence (same reasoning as bounce-back leaving
# floor/ceiling alone above).
PASS_PTS_DECAY_QB <- 0.79
RUSH_PTS_DECAY_QB <- 0.88
# Below this many games, a player's own floor is too noisy/thin a number
# to trust as a bounce-back bar -- reuses the same eligibility floor as
# everything else in this file rather than inventing a second one.
BOUNCEBACK_MIN_PRIOR_GAMES <- MIN_GAMES

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

# Separate, next-game-accuracy-tuned decay for the td_int columns
# specifically as used by weekly_scoring_stats below (Redraft's per-stat
# custom-scoring numbers) -- STAT_GROUP_DECAY$td_int above stays exactly
# as-is for Player Season Simulations' season-total bootstrap, its only
# validated target (backtest_stat_group_decay.R). weekly_scoring_stats
# reused that same constant for a genuinely different target (next-game
# accuracy) it was never backtested against; backtest_td_predictor.R plus
# a QB rushing_tds/passing_interceptions supplement swept it directly and
# found every td_int stat wants meaningfully faster decay for THIS
# target (0.60-0.90) than the season-total-tuned 0.94-0.97 -- independent
# corroboration of the same gap backtest_low_sample_decay.R had already
# surfaced (see its "established" slice, which found near-identical
# values). Keyed by exact stat column, not just group+position: even
# within one position's td_int group, the optimal decay varies a lot --
# QB's three td_int stats want 0.60/0.87/0.90, not one shared number.
WEEKLY_TD_DECAY <- list(
  QB = c(passing_tds = 0.87, passing_interceptions = 0.90, rushing_tds = 0.60),
  RB = c(rushing_tds = 0.69, receiving_tds = 0.66),
  WR = c(receiving_tds = 0.69),
  TE = c(receiving_tds = 0.60)
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
  receiving_yards = "yardage", receptions = "yardage", targets = "yardage"
)

MAX_GAMES_PER_SEASON <- 16   # 17 weeks minus 1 bye (weeks 1-17; week 18 excluded — see below)
# Usage per game (QB pass attempts, RB carries + targets, WR/TE targets) at or above which a season counts as
# a starter season for the availability calc -- see player_availability(). A judgment call, like the decay below.
AVAIL_ROLE_MIN_USAGE <- c(QB = 15, RB = 6, WR = 3, TE = 3)
AVAILABILITY_YEAR_DECAY <- 0.6  # not backtested — a judgment call weighting recent seasons'
                                 # availability more heavily than older ones

LOW_SAMPLE_SHRINK_THRESHOLD <- 20  # REMOVED (see "Shrinkage removed" in README): this
                                    # used to trigger an 80/20 blend toward a positional
                                    # baseline pool for players below this game count.
                                    # That blending mechanism is gone -- too many
                                    # unbacktested judgment calls stacked on top of each
                                    # other (which players qualified, the 80/20 split
                                    # itself, a manual tail-absence week cutoff, a
                                    # team-change flag). The name stays because the
                                    # THRESHOLD itself is kept, repurposed as a plain,
                                    # objective sample_confidence label ("building" below
                                    # this many games, "established" at or above it) --
                                    # no blending, just an honest confidence flag.

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
APPLY_MATCHUP_MULTIPLIER <- FALSE  # toggle -- mult is
                                    # still computed and published as-is (the
                                    # matchup_mult column, powers the Opp
                                    # column's heat tint) regardless of this
                                    # flag, so the backend/UI keep working;
                                    # this only controls whether it's actually
                                    # baked into floor/median/ceiling and the
                                    # per-stat breakdown. Turned off because
                                    # defense_history_seasons() currently
                                    # leans on last season's defensive
                                    # numbers this early in TARGET_SEASON --
                                    # not yet validated as predictive against
                                    # real same-season outperformance data.
                                    # Revisit ~Week 4, once there's enough of
                                    # this season's own results to run that
                                    # check (same walk-forward discipline
                                    # bounceback got in backtest_bounceback_
                                    # validation.R) before re-enabling.

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
               "targets", "receptions", "receiving_yards", "receiving_tds")
STAT_COLS_BY_POSITION <- list(
  QB = c("passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds"),
  RB = c("rushing_yards", "rushing_tds", "receptions", "receiving_yards", "receiving_tds"),
  WR = c("targets", "receptions", "receiving_yards", "receiving_tds"),
  TE = c("targets", "receptions", "receiving_yards", "receiving_tds")
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

# RYOE (Rush Yards Over Expected per attempt, RB/QB) and QB Scramble
# Rate/Play-Action Rate -- added by explicit request as isolated display
# context alongside WOPR/EPA, NOT projection inputs (same "doesn't feed
# the Monte Carlo simulation" treatment). No backtested decay/quantile
# calibration attempted for these three -- that effort is only justified
# when a metric needs to predict something; these don't. EPA_DECAY's
# 0.97 is reused directly (same "noisy game-to-game, wants a broad
# recent window over an aggressive recent-form read" reasoning as EPA
# itself). MIN_GAMES mirrors NGS_MIN_GAMES's existing 8-game precedent
# for a separately-joined per-game dataset that might have fewer matched
# games than a player's overall game log.
RYOE_DECAY <- c(RB = 0.97, QB = 0.97)
QB_CONTEXT_DECAY <- 0.97
RUSHING_NGS_MIN_GAMES <- 8
QB_CONTEXT_MIN_GAMES <- 8

# YAC Above Expectation (WR/TE only, part of stat_ranges below) --
# backtested via backtest_ngs_receiving_decay.R + calibrate_ngs_receiving_
# quantiles.R, same walk-forward methodology as STAT_GROUP_DECAY/FLOOR_Q/
# CEIL_Q but scored on a season-AVERAGE bootstrap (mean of resampled
# games) instead of a season-total one, since it's a rate stat, not a
# counting stat. floor_q/ceil_q here are the INTERNAL quantile to query
# the bootstrap distribution at, calibrated so the real value falls
# outside ~10% of the time out-of-sample -- NOT literally 0.10/0.90 (same
# "calibrated quantile" concept as FLOOR_Q/CEIL_Q above).
NGS_DECAY <- list(
  WR = c(yac_above_exp = 0.97),
  TE = c(yac_above_exp = 0.97)
)
NGS_FLOOR_Q <- list(
  WR = c(yac_above_exp = 0.03),
  TE = c(yac_above_exp = 0.05)
)
NGS_CEIL_Q <- list(
  WR = c(yac_above_exp = 0.98),
  TE = c(yac_above_exp = 0.88)
)
NGS_MIN_GAMES <- 8  # matches the backtest's own eligibility floor

# Target Share (WR/TE only, part of stat_ranges below) -- replaces the
# earlier Avg Separation slot. Real column already in load_player_stats()
# (no NGS join needed, unlike YAC Above Expectation above), same rate-
# stat season-average bootstrap, backtested via
# backtest_target_share_decay.R + calibrate_target_share_quantiles.R.
TARGET_SHARE_DECAY <- c(WR = 0.94, TE = 0.94)
TARGET_SHARE_FLOOR_Q <- c(WR = 0.00001, TE = 0.00013)
TARGET_SHARE_CEIL_Q  <- c(WR = 0.993,   TE = 0.992)
TARGET_SHARE_MIN_GAMES <- 8  # matches the backtest's own eligibility floor (counted within the this-season-and-last window)

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

# Snap-share history filter -- TRIED AND REJECTED, see README's
# "Snap-share history filter" section for the full story and numbers.
# Short version: filtering recency-decay history to only >50%-offense-
# snap games (motivated by a real case -- Jaylen Waddle's last game
# before a trade was a meaningless 25%-snap afterthought that nonetheless
# dominated his recency weighting) looked like a clean win in a first
# backtest, but that backtest had a real flaw (it compared predictions
# against DIFFERENT target games for the filtered vs. unfiltered case,
# not the same real outcome). Once corrected to predict the identical
# target game either way, the filtered version was WORSE for every
# position, badly for RB (+51% MAE). Throwing out ~48% of all history to
# remove noise games removes real signal too, and the remaining sample is
# too thin and unrepresentative to predict the full real range of
# outcomes (including future low-snap weeks, which still happen and still
# need to be predicted). Code fully reverted; load_history() below is
# back to its pre-this-idea form.
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
                 "fantasy_points_ppr", "carries", "attempts", "team",
                 "target_share", STAT_COLS, USAGE_METRIC_COLS)]
  reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
  reg <- reg[!is.na(reg$fantasy_points_ppr), ]
  reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
  reg$carries[is.na(reg$carries)] <- 0
  reg$targets[is.na(reg$targets)] <- 0
  for (col in USAGE_METRIC_COLS) reg[[col]][is.na(reg[[col]])] <- 0
  reg$attempts[is.na(reg$attempts)] <- 0
  for (col in STAT_COLS) reg[[col]][is.na(reg[[col]])] <- 0
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
# scoring threat down to zero. Mean has no such blind spot.
weighted_mean <- function(x, w) sum(x * w) / sum(w)

# Recency-weighted availability: fraction of a max-16-game season a player
# has actually played, weighted so recent seasons count more. Used ONLY for
# season-total simulation (Player Season Simulations) — weekly figures
# (Redraft, Best Ball) stay pure per-game numbers per product decision;
# availability is a season-total concept, not a single-week one.
#
# `completed_weeks` (weeks of `target_season` that have fully finished,
# per current_nfl_week() -- 0 before the season starts, and ALSO still 0
# for the entire real week during which it's being played, since
# current_nfl_week() doesn't roll over until every one of that week's
# games is done) matters because TARGET_SEASON's own games are now folded
# into history (see history_seasons()). A completed PAST season correctly
# divides by the full 16-game season. But dividing TARGET_SEASON's
# games-so-far by that same 16 right after Week 1 would read a healthy
# player who's played every game as ~6% available -- an in-progress
# season isn't a bad past season, it just hasn't happened yet. Divide
# TARGET_SEASON by how much of it has actually elapsed instead, so
# "played every game so far" reads as ~100% available, not "barely
# available."
#
# REAL BUG, caught and fixed here: the ~6% case above wasn't just a
# hypothetical this comment was warning against -- it was actually
# happening, undetected until Week 1 2026 first put a player from an
# early-window game (Wednesday/Thursday) into `player_games_df` while
# `completed_weeks` was still 0 (every other Week 1 game hadn't been
# played yet). The `completed_weeks > 0` guard on the denominator meant
# for THIS specific transitional window -- some real target-season games
# already exist, but no week has fully finished -- the code fell through
# to the full-season MAX_GAMES_PER_SEASON denominator anyway, exactly
# reproducing the ~6% failure mode the comment describes. Verified against
# Jaxon Smith-Njigba's real data: a perfect-attendance player reading
# 56.9% available overall (season simulation median crushed from ~327 to
# 192, ranking a true WR1 around WR14) instead of the correct ~100%. Fix:
# for target_season specifically, the denominator is the LARGER of
# completed_weeks and the latest week number actually present in this
# player's own target_season rows (so "I have a real Week 1 game" reads
# as "at least 1 week has elapsed for me", regardless of whether the
# league-wide week has fully closed out yet), floored at 1 to avoid a
# division by zero.
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
    if (s == target_season) {
      own_latest_week <- if (any(player_games_df$season == s)) {
        max(player_games_df$week[player_games_df$season == s])
      } else {
        0
      }
      denom <- max(completed_weeks, own_latest_week, 1)
    } else {
      denom <- MAX_GAMES_PER_SEASON
    }
    min(sum(player_games_df$season == s) / denom, 1)
  })
  # Role-aware (added after Malik Willis, a QB who has started all of MIA's games this year, was being
  # projected for ~58% of the remaining ones): a past season in which he was only a backup -- low usage in the
  # few games he appeared in -- is not an injury record, it is a depth-chart record, so it is left out of the
  # average. Only done for a player in a real role THIS season (usage per game at or above AVAIL_ROLE_MIN_USAGE);
  # a player who is still a backup, and every season in which he really was a starter (injuries included),
  # are scored exactly as before.
  pos <- player_games_df$position[1]
  thr <- AVAIL_ROLE_MIN_USAGE[pos]
  if (!is.na(thr) && target_season %in% player_games_df$season) {
    use <- function(d) if (pos == "QB") d$attempts else if (pos == "RB") d$touches else d$targets
    cur <- player_games_df[player_games_df$season == target_season, ]
    if (mean(use(cur), na.rm = TRUE) >= thr) {
      keep <- sapply(yrs, function(s) {
        if (s == target_season) return(TRUE)
        mean(use(player_games_df[player_games_df$season == s, ]), na.rm = TRUE) >= thr
      })
      yrs <- yrs[keep]
      a_by_yr <- a_by_yr[keep]
    }
  }
  yw <- AVAILABILITY_YEAR_DECAY ^ ((length(yrs) - 1):0)
  yw <- yw / sum(yw)
  min(sum(a_by_yr * yw), 1)
}

# ============================= SHRINKAGE (REMOVED) =============================
#
# Used to blend a "flagged" player's own history 80/20 toward a positional
# baseline pool, triggered by any of: low sample size, not finishing the
# last completed season (TAIL_ABSENCE_CUTOFF_WEEK), or a team change
# (APPLY_TEAM_CHANGE_SHRINK). Removed by direct product decision -- too
# many stacked, individually-unbacktested judgment calls (which players
# qualified for which trigger, the flat 80/20 split itself, a manually
# chosen week-10 cutoff) for a mechanism touching the published numbers.
# See README's "Shrinkage removed" section for the full writeup and what
# replaces it.
#
# One real, known consequence worth keeping on record rather than quietly
# losing: a player who didn't finish their last completed season (the
# James Conner case -- played weeks 1-3 of 2025, then nothing, but still
# reads as a normal 31-game "established" history) is no longer
# discounted for that at the weekly (Redraft/Best Ball) level. Player
# Season Simulations is unaffected -- its own availability calc
# (player_availability(), untouched by this removal) already handles
# this at the season-total level via per-year games-played fractions.

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

# Companion to load_opponents() -- same data.table-NSE fix (see that
# function's comment), just returning which side of the matchup a team
# is on instead of who they're playing. Named logical vector keyed by
# team, TRUE for the home team. Powers the "vs"/"@" distinction on the
# Team+Opponent column -- load_opponents() itself discards this (it maps
# each team straight to its opponent, home or away alike), so it needs
# its own lookup rather than being bolted onto the existing one.
load_home_flags <- function(season, week) {
  sch <- as.data.frame(load_schedules(season))
  wk <- sch[sch$week == week, c("away_team", "home_team")]
  setNames(c(rep(TRUE, nrow(wk)), rep(FALSE, nrow(wk))), c(wk$home_team, wk$away_team))
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

# Up to 2 QBs per team (the depth-chart starter, pos_rank 1, plus the
# next-ranked QB who's individually eligible) -- see project_all()'s
# call site for why the backup is kept too, and export_for_supabase()'s
# promotion step for how the two get collapsed to one PUBLISHED QB per
# team once this week's real OUT designations are known. Skips a rank
# entirely if that QB individually fails eligibility (e.g. Deshaun Watson
# is Cleveland's named 2026 starter but has zero 2025 games, so he fails
# the separate last-season-presence check) rather than leaving a gap --
# a team's kept rows are always its top eligible 1-2, never a hole in the
# middle of the chart.
#
# Matched to player_display_name by player_name (verified 32/32 exact
# match against the model's own naming, unlike load_out_players' ~96%).
# Unlike stats/injuries, depth charts aren't gated by most_recent_season()
# -- daily snapshots are already available for TARGET_SEASON.
select_team_qbs <- function(season, eligible_players, n = 2) {
  dc <- as.data.frame(load_depth_charts(season))
  latest <- dc[dc$dt == max(dc$dt) & dc$pos_abb == "QB", ]
  latest <- latest[order(latest$team, latest$pos_rank), ]
  do.call(rbind, lapply(unique(latest$team), function(tm) {
    chart <- latest[latest$team == tm, ]
    chart <- chart[order(chart$pos_rank), ]
    chart <- chart[chart$player_name %in% eligible_players, ]
    if (nrow(chart) == 0) return(NULL)
    # Top 2, not just the nominal starter -- keeps a hot-standby backup's
    # own row computed and ready to publish if the starter turns up OUT
    # this week (see export_for_supabase()'s promotion step). Only this
    # week's OUT designations (known later, at export time, not here)
    # decide which of the two actually gets shown -- this just makes
    # sure both exist to choose from.
    head(chart[, c("team", "player_name", "pos_rank")], n)
  }))
}

# ============================= PROJECTION =============================

# Produces one row per eligible player: weekly floor/median/ceiling (for
# Redraft + Best Ball), season median (availability-adjusted, for Player
# Season Simulations), and a weeks-15-17 playoff ceiling (for Best Ball's
# second column).
project_all <- function(seasons = history_seasons(), n_sims = 30000, seed = 42,
                         target_season = TARGET_SEASON, only_players = NULL,
                         bank_season_totals = BANK_SEASON_TOTALS) {
  set.seed(seed)
  reg <- load_history(seasons)
  # A run only ever sees games BEFORE the week it publishes for (Oct 20 2026). Re-running on a Monday after the
  # weekend's games, or on the Thursday / Sunday refresh, used to bank that week's games into the table still labelled
  # for that week, overwriting the real pre-week snapshot (the week scrubber then showed week 5's games next to a
  # projection that already knew week 6). Tuesday's run is unaffected: by then the week it publishes for is the next one.
  reg <- reg[!(reg$season == target_season & reg$week >= current_nfl_week(target_season)), ]
  # Position-relevant EPA as a single column, computed up front so every
  # per-stat column below (WOPR/EPA included) gets the identical
  # recency-weighted treatment as the rest of the model's projections,
  # not a plain historical average -- a genuine season-ahead projection
  # like everything else on this page rather than a stat anyone could
  # reproduce straight off nflreadr.
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
  # ...or games THIS season: a player who sat out all of last year but is
  # back and playing now (Deshaun Watson: 0 games in 2025, CLE's starter in
  # 2026) is current, not stale. Without this he was dropped every week.
  played_recently <- unique(reg$player_display_name[reg$season %in% c(last_completed_season, target_season)])
  eligible <- intersect(eligible, played_recently)

  # A team's top-2 QB with a short history (QB_SHORT_MIN_GAMES..MIN_GAMES-1
  # games) is let in too, so a backup who takes over when the starter is OUT
  # has a row to promote (Tanner McKee, PHI Week 6 2026: 5 career games, Jalen
  # Hurts OUT -- the Eagles published no QB at all). He is projected from his
  # own few games like anyone else (no boost; labelled Building), and the
  # promotion step in export_for_supabase() still publishes only the starter,
  # or the backup when the starter is OUT.
  short_qbs <- names(counts[counts >= QB_SHORT_MIN_GAMES & counts < MIN_GAMES])
  short_qbs <- intersect(short_qbs, played_recently)
  short_qbs <- short_qbs[reg$position[match(short_qbs, reg$player_display_name)] == "QB"]

  # 3rd-string-or-deeper QBs excluded entirely (all three tables) --
  # current depth chart, not last season's history, since a QB's
  # competition/starter status can change independent of how they
  # performed historically. Keeps the top 2 per team (not just 1) so a
  # real backup's row is computed and ready to publish if the starter
  # ends up OUT -- found via a real gap: Jayden Daniels (WAS, Week 4
  # 2026) went OUT, and his backup Marcus Mariota (set to actually start)
  # was invisible on the site all week because the old version of this
  # filter only ever kept the single nominal starter, decided BEFORE this
  # week's injury designations even exist. The actual starter-vs-backup
  # call for which ONE gets published is made in export_for_supabase(),
  # where OUT status is already known -- this just makes sure both exist
  # to choose from. Fails safe: if depth-chart data is unavailable, skip
  # this filter rather than accidentally dropping every QB.
  # The short-history QBs are checked against the chart separately and only
  # ADDED: they never push a regular QB out of his team's top 2 (a hurt
  # starter is often listed last -- Jalen Hurts was PHI's QB4 behind McKee,
  # Cole Payton and Joe Milton -- and must keep his rows).
  qb_depth <- tryCatch(select_team_qbs(target_season, eligible), error = function(e) {
    cat("Depth chart unavailable this run -- skipping backup-QB filter:", conditionMessage(e), "\n")
    NULL
  })
  short_in <- if (length(short_qbs)) {
    tryCatch(intersect(short_qbs, select_team_qbs(target_season, c(eligible, short_qbs))$player_name), error = function(e) character(0))
  } else character(0)
  if (!is.null(qb_depth)) {
    player_positions <- reg$position[match(eligible, reg$player_display_name)]
    is_deep_backup_qb <- player_positions == "QB" & !(eligible %in% qb_depth$player_name)
    cat("3rd-string-or-deeper QBs removed:", sum(is_deep_backup_qb), "-",
        paste(eligible[is_deep_backup_qb], collapse = ", "), "\n")
    eligible <- eligible[!is_deep_backup_qb]
    if (length(short_in)) {
      cat("Short-history top-2 depth-chart QBs let in:", paste(short_in, collapse = ", "), "\n")
      eligible <- c(eligible, short_in)
    }
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

  # Current team for DISPLAY only. Falls back to the most recent team in the game log if a
  # player isn't found in load_players() (rare -- retired/inactive edge
  # cases). Same "AZ" -> "ARI" mismatch as before applies here too.
  current_team <- as.data.frame(load_players())[, c("display_name", "position", "latest_team")]
  current_team$latest_team <- ifelse(current_team$latest_team == "AZ", "ARI", current_team$latest_team)
  publish_week <- current_nfl_week(target_season)
  week_opponent <- load_opponents(target_season, publish_week)
  week_is_home <- load_home_flags(target_season, publish_week)
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

  # Sleeper's own weekly median projection for this exact (target_season,
  # publish_week) -- fetched once per run, same as matchup_mult above.
  # See SLEEPER_BLEND_WEIGHT's comment for the validation. Fails safe: a
  # NULL here just means every player's `sleeper_med` lookup below comes
  # back NA, which the per-player loop already treats as "no blend this
  # player" (falls back to our own number alone).
  sleeper_med <- if (APPLY_SLEEPER_BLEND) {
    tryCatch(fetch_sleeper_median_projections(target_season, publish_week), error = function(e) {
      cat("Sleeper projections unavailable this run -- skipping the blend:", conditionMessage(e), "\n")
      NULL
    })
  } else {
    NULL
  }
  if (APPLY_SLEEPER_BLEND) {
    cat("Sleeper projections matched:", if (is.null(sleeper_med)) 0 else length(sleeper_med), "\n")
  }

  # YAC Above Expectation (WR/TE stat_ranges, added below) -- real Next Gen
  # Stats PER-GAME history (week != 0; week == 0 is NGS's own season-
  # aggregate row, not usable as a resampling pool), same `seasons`
  # lookback window as `reg` above. Bootstrap-resampled per player in the
  # loop below using NGS_DECAY/NGS_FLOOR_Q/NGS_CEIL_Q (see their
  # definitions up top) for a genuine floor/median/ceiling, not a flat
  # point value -- backtested via backtest_ngs_receiving_decay.R +
  # calibrate_ngs_receiving_quantiles.R. Fails safe: if NGS is
  # unavailable, stays NULL and the per-player loop leaves the stat out
  # entirely rather than erroring.
  ngs_receiving_hist <- tryCatch({
    ngs <- as.data.frame(load_nextgen_stats(stat_type = "receiving", seasons = seasons))
    ngs[ngs$week != 0 & ngs$season_type == "REG", c("player_gsis_id", "season", "week",
                                                      "avg_yac_above_expectation")]
  }, error = function(e) {
    cat("NGS receiving data unavailable this run -- skipping YAC above expectation:",
        conditionMessage(e), "\n")
    NULL
  })

  # Expected receiving TDs per game (ffopportunity), for rec_td_blend.R's WR/TE weekly receiving-TD figure.
  # Fails safe: NULL means weekly_scoring_stats keeps the old recency-weighted actual-TD mean.
  rec_td_exp_hist <- tryCatch({
    o <- as.data.frame(load_ff_opportunity(seasons = seasons, stat_type = "weekly"))
    o <- o[o$position %in% c("WR", "TE") & !is.na(o$week), c("player_id", "season", "week", "rec_touchdown_exp")]
    o[!duplicated(o[, c("player_id", "season", "week")]), ]
  }, error = function(e) {
    cat("Expected-TD data unavailable this run -- keeping the old WR/TE receiving-TD method:", conditionMessage(e), "\n")
    NULL
  })

  # RYOE (RB/QB, display-only -- see RYOE_DECAY's own comment above) --
  # real Next Gen Stats rushing, same per-game/gsis_id join pattern as
  # ngs_receiving_hist above.
  rushing_ngs_hist <- tryCatch({
    ngs <- as.data.frame(load_nextgen_stats(stat_type = "rushing", seasons = seasons))
    ngs[ngs$week != 0 & ngs$season_type == "REG", c("player_gsis_id", "season", "week",
                                                      "rush_yards_over_expected_per_att")]
  }, error = function(e) {
    cat("NGS rushing data unavailable this run -- skipping RYOE:",
        conditionMessage(e), "\n")
    NULL
  })

  # QB Scramble Rate / Play-Action Rate -- neither has a per-player
  # summary table anywhere in nflreadr, so this is the one metric pair on
  # this page sourced from raw play-by-play (load_pbp()) instead of a
  # pre-aggregated table -- meaningfully heavier to load than everything
  # else here; expect this to add real time to the run. Display-only,
  # same as RYOE/WOPR/EPA above. qb_dropback==1 catches both real pass
  # attempts and scrambles (a scramble IS a dropback that didn't end in a
  # throw), so "rate" here means share of dropbacks -- the standard
  # framing for both stats.
  qb_context_hist <- tryCatch({
    pbp <- as.data.frame(load_pbp(seasons = seasons))
    pbp <- pbp[pbp$season_type == "REG" & !is.na(pbp$qb_dropback) & pbp$qb_dropback == 1, ]
    # On a scramble, nflfastR leaves passer_player_id NA and attributes
    # the play to rusher_player_id instead (it's scored as a designed-
    # pass-turned-run). Filtering/grouping on passer_player_id alone (an
    # earlier version of this block did exactly that) silently drops
    # every scramble from BOTH the numerator and the qb_dropback
    # denominator -- confirmed as the exact reason scramble_rate came
    # back a flat 0 for every QB the first time this ran. qb_id folds
    # both id columns into one so a scramble still resolves to its QB.
    pbp$qb_id <- ifelse(!is.na(pbp$passer_player_id), pbp$passer_player_id,
                         ifelse(pbp$qb_scramble == 1, pbp$rusher_player_id, NA))
    pbp <- pbp[!is.na(pbp$qb_id), ]
    # play_action is NOT a plain pbp column (confirmed against nflreadr's
    # own dictionary_pbp -- no such field). It only exists in the
    # separate, manually-charted FTN dataset (is_play_action, 2022+),
    # joined in here by game_id/play_id (FTN's nflverse_game_id/
    # nflverse_play_id). A play with no FTN match (pre-2022 history, or a
    # rare unmatched play) counts as not-play-action rather than being
    # dropped from the rate's denominator.
    ftn <- as.data.frame(load_ftn_charting(seasons = seasons[seasons >= 2022]))
    pbp <- merge(
      pbp, ftn[, c("nflverse_game_id", "nflverse_play_id", "is_play_action")],
      by.x = c("game_id", "play_id"), by.y = c("nflverse_game_id", "nflverse_play_id"),
      all.x = TRUE
    )
    pbp$is_play_action[is.na(pbp$is_play_action)] <- 0
    agg <- aggregate(
      cbind(scrambles = qb_scramble, play_actions = is_play_action, dropbacks = qb_dropback) ~
        qb_id + season + week,
      data = pbp, FUN = sum
    )
    agg$scramble_rate <- 100 * agg$scrambles / agg$dropbacks
    agg$play_action_rate <- 100 * agg$play_actions / agg$dropbacks
    names(agg)[names(agg) == "qb_id"] <- "player_gsis_id"
    agg[, c("player_gsis_id", "season", "week", "scramble_rate", "play_action_rate")]
  }, error = function(e) {
    cat("Play-by-play data unavailable this run -- skipping scramble/play-action rate:",
        conditionMessage(e), "\n")
    NULL
  })

  # Test hook: restrict the run to named players (a quick before/after check
  # without the full ~30 minute run). NULL in production.
  if (!is.null(only_players)) eligible <- intersect(eligible, only_players)

  # Games each team has played so far this season (distinct weeks with a game
  # in the log) -- how many are left for the banked-totals mode below.
  cur_rows <- reg[reg$season == target_season, ]
  team_games_played <- if (nrow(cur_rows) > 0) tapply(cur_rows$week, cur_rows$team, function(w) length(unique(w))) else c()

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

    # Banked-totals mode (see BANK_SEASON_TOTALS): this season's real totals so
    # far, plus how many games his team has left to simulate.
    bank_on <- isTRUE(bank_season_totals) && completed_weeks > 0
    cur <- d[d$season == target_season, ]
    banked_pts <- 0
    n_draw <- MAX_GAMES_PER_SEASON
    if (bank_on) {
      tg <- if (nrow(cur) > 0) unname(team_games_played[tail(cur$team, 1)]) else unname(team_games_played[team])
      if (length(tg) != 1 || is.na(tg)) tg <- completed_weeks
      tg <- max(tg, nrow(cur))
      n_draw <- max(MAX_GAMES_PER_SEASON - tg, 0)
      banked_pts <- sum(cur$fantasy_points_ppr, na.rm = TRUE)
    }
    bank_g <- NULL; bank_healthy <- NULL
    if (bank_on) {
      bank_g <- rbinom(n_sims, n_draw, avail)
      bank_healthy <- bank_g >= ceiling(BANKED_HEALTHY_SHARE * n_draw)
      # A very injury-prone player may have too few "stays on the field" runs to read a
      # range from; use his healthiest 20% of runs instead.
      if (sum(bank_healthy) < 200) bank_healthy <- bank_g >= quantile(bank_g, 0.8)
    }

    # Season fantasy-points total: unchanged mechanism from before --
    # samples GAME INDICES (not points values directly), resampled with
    # the single position-level MED_DECAY (wm), matching Redraft/Best
    # Ball's own recency weighting. Powers season_floor/median/ceiling
    # and the boom/bust profile only; NOT part of the stat-group split
    # below (that backtest targeted the granular per-stat columns, not
    # the blended points total).
    if (bank_on) {
      rem_pts <- bank_sim_sums(matrix(x, ncol = 1), wm, bank_g)[, 1]
      rem_pts_full <- bank_sim_sums(matrix(x, ncol = 1), wm, rep.int(n_draw, n_sims))[, 1]
      szn <- rem_pts + banked_pts
      szn_band <- bank_band(pos, "pts", banked_pts, rem_pts, bank_healthy, n_draw, rem_pts_full)
    } else {
      szn <- replicate(n_sims, {
        g <- sum(runif(n_draw) < avail)
        if (g == 0) 0 else sum(x[sample(idx, g, replace = TRUE, prob = wm)])
      }) + banked_pts
    }

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
    # backtest_stat_group_decay.R. Season totals rely on the availability
    # dampening above, not any per-stat blending. For interceptions, "ceiling" is
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

        if (bank_on) {
          # Banked mode: see bank_band(). One games-played draw per run, shared by every stat.
          rem <- bank_sim_sums(as.matrix(d[, cols, drop = FALSE]), w_group, bank_g)
          rem_full <- bank_sim_sums(as.matrix(d[, cols, drop = FALSE]), w_group, rep.int(n_draw, n_sims))
          for (j in seq_along(cols)) {
            band <- bank_band(pos, cols[j], sum(cur[[cols[j]]], na.rm = TRUE), rem[, j], bank_healthy, n_draw, rem_full[, j])
            stat_ranges[[cols[j]]] <- list(floor = band[["floor"]], median = band[["median"]], ceiling = band[["ceiling"]])
          }
          next
        }

        group_sim <- replicate(n_sims, {
          g <- sum(runif(n_draw) < avail)
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
        if (bank_on && nrow(cur) > 0) {
          # Each row of group_sim is one stat; add that stat's real total so far.
          group_sim <- group_sim + vapply(cols, function(col) sum(cur[[col]], na.rm = TRUE), numeric(1))
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

    # YAC Above Expectation / Target Share (WR/TE only) -- appended AFTER
    # the relevant_stats reindex above so they aren't dropped by it, since
    # neither key is one of STAT_COLS_BY_POSITION's stat-group columns.
    # Both bootstrap-resample the player's own per-game history (recency-
    # weighted, same `avail`-driven games-played model as every other
    # season sim on this page) and take the MEAN of each simulated
    # season's games -- these are rate stats, not counting stats, so a
    # season "total" wouldn't mean anything the way it does for yards/TDs.
    # Genuinely different floor/median/ceiling now, not the same value
    # three times.
    if (pos %in% c("WR", "TE")) {
      # YAC Above Expectation -- real Next Gen Stats, needs the separate
      # ngs_receiving_hist join (gsis_id) since it isn't in `reg`/`d`.
      if (!is.null(ngs_receiving_hist)) {
        pid <- d$player_id[1]
        player_ngs <- ngs_receiving_hist[ngs_receiving_hist$player_gsis_id == pid, ]
        player_ngs <- player_ngs[order(player_ngs$season, player_ngs$week), ]
        n_ngs <- nrow(player_ngs)
        if (n_ngs >= NGS_MIN_GAMES) {
          vals <- player_ngs$avg_yac_above_expectation
          if (!all(is.na(vals))) {
            w_ngs <- recency_weights(n_ngs, NGS_DECAY[[pos]][["yac_above_exp"]])
            sim <- replicate(n_sims, {
              g <- sum(runif(MAX_GAMES_PER_SEASON) < avail)
              if (g == 0) NA_real_ else mean(sample(vals, g, replace = TRUE, prob = w_ngs))
            })
            sim <- sim[!is.na(sim)]
            if (length(sim) >= 100) {  # too few valid draws (very low availability) to trust the quantiles otherwise
              stat_ranges[["yac_above_exp"]] <- list(
                floor = round(as.numeric(quantile(sim, NGS_FLOOR_Q[[pos]][["yac_above_exp"]])), 2),
                median = round(as.numeric(quantile(sim, 0.50)), 2),
                ceiling = round(as.numeric(quantile(sim, NGS_CEIL_Q[[pos]][["yac_above_exp"]])), 2)
              )
            }
          }
        }
      }

      # Target Share -- already a column on `d` (from load_player_stats()
      # via load_history()), no separate data source/join needed. Stored
      # as percentage POINTS (0-100), not a 0-1 fraction, so it reads as
      # "31.4" rather than an easy-to-misread "0.314" next to the site's
      # other plain-number stats.
      # Only this season and last (founder, Oct 20 2026): a target share older than that says little about the role he
      # has now, so the 3-year history the other stats use is cut to target_season - 1 onward for this one.
      ts_vals <- d$target_share[!is.na(d$target_share) & d$season >= target_season - 1]
      n_ts <- length(ts_vals)
      if (n_ts >= TARGET_SHARE_MIN_GAMES) {
        w_ts <- recency_weights(n_ts, TARGET_SHARE_DECAY[[pos]])
        sim_ts <- replicate(n_sims, {
          g <- sum(runif(MAX_GAMES_PER_SEASON) < avail)
          if (g == 0) NA_real_ else mean(sample(ts_vals, g, replace = TRUE, prob = w_ts))
        })
        sim_ts <- sim_ts[!is.na(sim_ts)]
        if (length(sim_ts) >= 100) {
          stat_ranges[["target_share"]] <- list(
            floor = round(100 * as.numeric(quantile(sim_ts, TARGET_SHARE_FLOOR_Q[[pos]])), 1),
            median = round(100 * as.numeric(quantile(sim_ts, 0.50)), 1),
            ceiling = round(100 * as.numeric(quantile(sim_ts, TARGET_SHARE_CEIL_Q[[pos]])), 1)
          )
        }
      }
    }

    playoff <- replicate(n_sims, sum(sample(x, 3, replace = TRUE, prob = wc)))

    # Bounce-back trigger: had_bad_week itself is computed further down
    # (after fl/med/cei exist and the matchup multiplier has been
    # applied), by directly comparing this player's most recent real game
    # against the exact `floor` value this row publishes -- see that
    # block for why, and BOUNCEBACK_MED_Q's comment up top for why it's
    # informational only (backtest_bounceback_validation.R walk-forward
    # tested shifting the point PREDICTION in response to the pattern,
    # and that made next-game MAE worse, not better: +0.7% overall,
    # +3.0% on the games it actually changes). med_q therefore always
    # stays 0.50 below.
    med_q <- 0.50

    # QB median: passing/rushing split (see PASS_PTS_DECAY_QB above). A
    # genuine QUANTILE of a resampled distribution, NOT a sum of two
    # weighted means -- median needs to mean the same statistical thing
    # for QB that it means for every other position (a real percentile of
    # a distribution, via weighted_quantile everywhere else). Built the
    # same way project_all()'s own season totals already build a
    # distribution to take a plain quantile of: independently resample
    # n_sims (game, not stat-column) draws for each component at its own
    # decay -- passing and rushing games are drawn separately (same "own
    # resampling pass per stat-group, cross-group correlation not
    # preserved" tradeoff the season stat_ranges split already accepts,
    # see README) -- sum them, then take the 0.50 quantile of the SUM.
    # Re-validated in this exact form (not just the mean-based version)
    # via backtest_qb_pass_rush_split.R: -1.07% next-game MAE, a stronger
    # result than the mean-based version's -0.68%, not just a cosmetic
    # consistency fix.
    if (pos == "QB") {
      # MEAN, not a quantile -- the one deliberate exception to every
      # other position/field on this page. Real head-to-head validation
      # against Sleeper's own published projections (2024-2025, ~800 real
      # QB weeks, see README's "QB: median vs. mean" section) found the
      # model biased low by ~1 point at every position when reporting the
      # median -- expected for a right-skewed stat (mean sits above
      # median for skewed data), and Sleeper's numbers behave like an
      # expected-value forecast, not a literal median. Switching QB
      # specifically to a mean won on EVERY measure tested (MAE, RMSE,
      # MedAE, bias, rank correlation) -- not a tradeoff, a clean win.
      # RB/WR/TE were tested the same way and did NOT win cleanly (mean
      # fixed their bias/RMSE too, but made MAE/MedAE measurably worse --
      # a real tradeoff, not obviously a win), so they deliberately stay
      # on the quantile-median path below. QB's own "median" field is
      # therefore not literally a median for this one position -- accept
      # that naming reality rather than hide it.
      pass_hist <- 0.04 * d$passing_yards + 4 * d$passing_tds - 2 * d$passing_interceptions
      rush_hist <- 0.1 * d$rushing_yards + 6 * d$rushing_tds
      w_pass <- recency_weights(n, PASS_PTS_DECAY_QB)
      w_rush <- recency_weights(n, RUSH_PTS_DECAY_QB)
      med <- weighted_mean(pass_hist, w_pass) + weighted_mean(rush_hist, w_rush)
      fl  <- weighted_quantile(x, wm, FLOOR_Q[pos])
      cei <- weighted_quantile(x, wc, CEIL_Q[pos])
    } else {
      fl  <- weighted_quantile(x, wm, FLOOR_Q[pos])
      # 85/15 quantile-median / mean blend -- low-bias fix, see
      # MED_MEAN_BLEND_SHARE. Floor/ceiling stay pure quantiles (the swept
      # harness only tested the median point estimate).
      med <- MED_MEAN_BLEND_SHARE * weighted_quantile(x, wm, med_q) +
             (1 - MED_MEAN_BLEND_SHARE) * weighted_mean(x, wm)
      cei <- weighted_quantile(x, wc, CEIL_Q[pos])
    }

    # Sleeper blend -- median (point estimate) ONLY, same "the swept
    # harness only tested the median" discipline as MED_MEAN_BLEND_SHARE
    # two blocks up. Floor/ceiling are calibrated internal quantiles of
    # OUR OWN distribution (FLOOR_Q/CEIL_Q) -- Sleeper doesn't publish a
    # range to blend those against, and blending only the single point
    # estimate is exactly what backtest_vs_sleeper.R validated. Silently
    # falls back to 100% our own number (blend weight effectively 1) for
    # any player Sleeper doesn't have a projection for -- a real gap
    # (deep bench, practice-squad-adjacent players), not an error.
    if (!is.null(sleeper_med)) {
      skey <- paste0(normalize_sleeper_name(p), "|", pos)
      if (skey %in% names(sleeper_med)) {
        w_own <- SLEEPER_BLEND_WEIGHT[[pos]]
        med <- w_own * med + (1 - w_own) * sleeper_med[[skey]]
      }
    }

    # Objective, unblended sample-confidence flag -- purely a game-count
    # threshold, no baseline-pool blending (see "Shrinkage (removed)"
    # above). Computed here since it needs `n`, and used only for the
    # sample_confidence label downstream, not for anything that changes
    # a published number.
    low_sample <- n < LOW_SAMPLE_SHRINK_THRESHOLD

    # Trend: last-3-games simple average vs. the weighted median baseline
    # above, +/-10% band. Same comparison that caught Aaron Jones/Kamara's
    # decline and RJ Harvey's Dobbins-driven spike earlier this session,
    # now surfaced as its own tag rather than something found by hand.
    recent3 <- mean(tail(x, 3))
    trend <- if (med <= 0) {
      "STEADY"
    } else if (recent3 > med * 1.10) {
      "RISING"
    } else if (recent3 < med * 0.90) {
      "FALLING"
    } else {
      "STEADY"
    }

    opp <- week_opponent[team]
    opp <- if (length(opp) == 1 && !is.na(opp)) unname(opp) else NA_character_
    is_home <- week_is_home[team]
    is_home <- if (length(is_home) == 1 && !is.na(is_home)) unname(is_home) else NA

    mult <- 1  # neutral by default; overwritten below when matchup data covers this opponent+position
    if (!is.null(matchup_mult) && !is.na(opp)) {
      mult_key <- paste(opp, pos)
      if (mult_key %in% names(matchup_mult)) {
        mult <- matchup_mult[[mult_key]]
      }
    }
    # `mult` itself is published unconditionally below (matchup_mult
    # column, powers the Opp column's heat tint) -- applied_mult is what
    # actually scales the numbers, gated by APPLY_MATCHUP_MULTIPLIER (see
    # that constant's comment for why it's off right now).
    applied_mult <- if (APPLY_MATCHUP_MULTIPLIER) mult else 1
    fl  <- fl * applied_mult
    med <- med * applied_mult
    cei <- cei * applied_mult

    # Monotonicity clamp: fl/med/cei are NOT three quantiles of one
    # consistent distribution -- med is either an 85/15 quantile-median/
    # mean blend (MED_DECAY-weighted) or, for QB, a sum of two separately
    # resampled pass/rush weighted means, while fl/cei are quantiles built
    # with their own independently-backtested decay/quantile (MED_DECAY
    # for fl, CEIL_DECAY for cei -- see FLOOR_Q/CEIL_Q's comment). Each was
    # tuned solely for its OWN accuracy target, so nothing guarantees they
    # stay ordered -- confirmed live in production: 10/1292 real Redraft
    # rows (0.77%) had median > ceiling or median < floor, concentrated on
    # deep-bench/near-zero-usage players with volatile small-sample
    # history (e.g. Chris Brooks: floor 0, median 6.9, ceiling 5.2). This
    # only ever widens fl/cei to include med, never touches med itself or
    # either number's own backtested value in the ~99% of rows already
    # correctly ordered -- purely a display-consistency fix, not a
    # different estimate.
    cei <- max(cei, med)
    fl  <- min(fl, med)

    # Bounce-back trigger: was this player's most recent real game (x's
    # last element -- d/reg is chronologically ordered, see
    # load_history()) at or below `fl`, the EXACT floor value this row
    # publishes -- post QB-split and post matchup-multiplier,
    # the same number that ends up in the Floor column? Compared directly
    # against the number a person can actually see on the page, not a
    # separately-recomputed one. An earlier version of this compared
    # against a leave-one-out quantile built from prior games only (to
    # keep the flagged game from defining its own bar) -- principled, but
    # it silently differed from the published floor two ways at once
    # (leave-one-out, and computed before the matchup multiplier), which
    # could flag a player whose actual game beat the number shown as his
    # floor. That's the one thing this badge must never do -- explicit
    # product requirement -- so it's gone in favor of the literal
    # comparison. Requires enough games to trust a floor exists at all
    # (BOUNCEBACK_MIN_PRIOR_GAMES, same eligibility floor as elsewhere in
    # this file).
    #
    # The "most recent real game" must also be from target_season
    # specifically -- x[n]/d's last row can otherwise be the player's
    # final game of LAST season (true for every player until their own
    # target_season Week 1 has actually been played), and a bad game from
    # a season that's already over isn't "you just had a bad week," it's
    # just stale history. Flagging off it would badge a player purely
    # because the new season hasn't produced enough of its own data yet
    # -- explicit product requirement to stop doing that. Needs its own
    # season-scoped slice rather than reusing x[n]/n (which intentionally
    # span the full multi-season lookback the floor/ceiling distribution
    # itself is built from) -- d is chronologically ordered within that
    # window (see load_history()), so filtering to target_season and
    # taking the last element is still "this player's most recent game,"
    # just scoped to games that can plausibly mean something for this
    # badge. A player with zero target_season games yet simply isn't
    # eligible -- no fallback to last season's data.
    #
    # INFORMATIONAL ONLY either way -- see med_q's comment above for why
    # the point prediction itself never reacts to this.
    this_season_x <- x[d$season == target_season]
    had_bad_week <- n >= BOUNCEBACK_MIN_PRIOR_GAMES &&
      length(this_season_x) >= 1 && tail(this_season_x, 1) <= fl

    # Weekly per-stat MEANS (raw components -- receptions, yards, TDs,
    # INTs), same matchup-mult treatment as `med` above, just one
    # column at a time instead of the blended fantasy_points_ppr total --
    # and mean rather than median, see weighted_mean()'s comment for why
    # median silently loses touchdown value here. Powers Redraft's custom
    # scoring settings: the frontend recomputes a fantasy-point total from
    # these raw components under the user's own PPR/TE-premium choices,
    # rather than being stuck with the single fixed-scoring `median` baked
    # in here.
    #
    # Recency weighting: each column uses ITS OWN stat-group's already-
    # backtested decay (STAT_GROUP_DECAY/STAT_GROUP_BY_STAT above -- same
    # td_int-vs-yardage split validated for the season-total stat_ranges
    # right above this block) instead of reusing `wm` (MED_DECAY, tuned to
    # predict the next fantasy_points_ppr week, not any individual raw
    # column). Doesn't make sum(weekly_scoring_stats-derived points) equal
    # `med` -- that gap is structural (median-of-a-sum vs sum-of-means, see
    # weighted_mean()'s comment) and no choice of decay closes it -- but it
    # does mean each component is now projected with the decay that best
    # predicts THAT column specifically, same rationale as WOPR/EPA above.
    #
    # EXCEPTION: td_int columns use WEEKLY_TD_DECAY instead of
    # STAT_GROUP_DECAY$td_int -- see that constant's comment for why the
    # season-total-tuned value is wrong for this next-game target.
    # SECOND EXCEPTION: WR/TE receiving_tds use rec_td_blend.R (75% expected
    # TDs + 25% slow-decay actual TDs) instead -- the fast-decay actual-TD
    # mean above was the worst of every method tested; see that file's header.
    # Targets is a display-only season stat (Player Season Simulations) -- not
    # a scoring component, so it stays out of the weekly scoring_stats JSON
    # that Redraft's custom scoring reads.
    relevant_weekly_stats <- setdiff(STAT_COLS_BY_POSITION[[pos]], "targets")
    weekly_scoring_stats <- if (!is.null(relevant_weekly_stats)) {
      setNames(lapply(relevant_weekly_stats, function(col) {
        col_x <- d[[col]]
        group <- STAT_GROUP_BY_STAT[[col]]
        decay <- if (group == "td_int" && col %in% names(WEEKLY_TD_DECAY[[pos]])) {
          WEEKLY_TD_DECAY[[pos]][[col]]
        } else {
          STAT_GROUP_DECAY[[group]][pos]
        }
        w_col <- recency_weights(n, decay)
        if (col == "receiving_tds" && pos %in% c("WR", "TE")) {
          blended <- blended_rec_td(d, rec_td_exp_hist)
          if (!is.na(blended)) return(round(blended * applied_mult, 2))
        }
        round(weighted_mean(col_x, w_col) * applied_mult, 2)
      }), relevant_weekly_stats)
    } else {
      list()
    }
    weekly_scoring_stats_json <- jsonlite::toJSON(weekly_scoring_stats, auto_unbox = TRUE)

    # WOPR/EPA: projected forward the same way every other rate stat on
    # this page is -- own backtested recency weights (WOPR_DECAY/
    # EPA_DECAY, not wm/MED_DECAY -- see the comment by their definition).
    # This is a projection of the player's usage/efficiency going into the
    # target season, not a raw historical average -- matches the site's
    # existing definition of "projection" for rate stats (see
    # weighted_mean()'s comment on weekly_scoring_stats).
    epa_component <- d$epa_component
    w_epa <- recency_weights(n, EPA_DECAY[pos])
    if (pos != "QB") {
      w_wopr <- recency_weights(n, WOPR_DECAY[pos])
      wopr_val <- round(weighted_mean(d$wopr, w_wopr), 3)
    } else {
      wopr_val <- NA_real_
    }
    epa_val <- round(weighted_mean(epa_component, w_epa), 2)

    # RYOE (RB/QB) -- weighted mean over the player's own matched NGS
    # rushing games, same treatment as WOPR/EPA. NA if NGS data wasn't
    # loadable this run, or this player has too few matched games to
    # trust a weighted mean from (RUSHING_NGS_MIN_GAMES).
    ryoe_val <- NA_real_
    if (pos %in% c("RB", "QB") && !is.null(rushing_ngs_hist)) {
      pid <- d$player_id[1]
      player_rush_ngs <- rushing_ngs_hist[rushing_ngs_hist$player_gsis_id == pid, ]
      rush_vals <- player_rush_ngs$rush_yards_over_expected_per_att
      rush_vals <- rush_vals[!is.na(rush_vals)]
      if (length(rush_vals) >= RUSHING_NGS_MIN_GAMES) {
        w_rush <- recency_weights(length(rush_vals), RYOE_DECAY[pos])
        ryoe_val <- round(weighted_mean(rush_vals, w_rush), 2)
      }
    }

    # Scramble Rate / Play-Action Rate (QB only) -- same weighted-mean
    # treatment, matched games from qb_context_hist (load_pbp(), see its
    # own comment above for why it's PBP-sourced instead of a
    # pre-aggregated table like everything else here).
    scramble_rate_val <- NA_real_
    play_action_rate_val <- NA_real_
    if (pos == "QB" && !is.null(qb_context_hist)) {
      pid <- d$player_id[1]
      player_qb_ctx <- qb_context_hist[qb_context_hist$player_gsis_id == pid, ]
      if (nrow(player_qb_ctx) >= QB_CONTEXT_MIN_GAMES) {
        w_qb <- recency_weights(nrow(player_qb_ctx), QB_CONTEXT_DECAY)
        scramble_rate_val <- round(weighted_mean(player_qb_ctx$scramble_rate, w_qb), 1)
        play_action_rate_val <- round(weighted_mean(player_qb_ctx$play_action_rate, w_qb), 1)
      }
    }

    rows[[p]] <- data.frame(
      player_name = p, position = pos, team = team, opponent = opp, is_home = is_home, games = n,
      touches_per_game = round(mean(d$touches), 1),
      availability_pct = round(100 * avail, 0),
      shrunk = low_sample,
      trend = trend,
      bounceback = had_bad_week,
      matchup_mult = round(mult, 2),
      floor = round(fl, 1),
      median = round(med, 1),
      ceiling = round(cei, 1),
      weekly_scoring_stats_json = weekly_scoring_stats_json,
      # Season floor/ceiling now use SEASON_FLOOR_Q/SEASON_CEIL_Q, not a
      # literal 10th/90th percentile -- see those constants' own comment
      # for why. Previous reasoning here ("it's already a large Monte
      # Carlo sample, so a plain empirical quantile is fine") was wrong:
      # a bigger bootstrap sample reduces NOISE in estimating a quantile,
      # it doesn't fix BIAS if the resampled distribution itself
      # understates real season-to-season volatility -- confirmed via
      # backtest_season_calibration.R against real 2022-2025 season
      # totals, literal 0.10/0.90 produced real below/above rates of
      # 22-34% / 17-20% (target 10%/10%) at every position.
      season_floor = if (bank_on) szn_band[["floor"]] else round(quantile(szn, SEASON_FLOOR_Q[pos]), 0),
      season_median = if (bank_on) szn_band[["median"]] else round(quantile(szn, 0.50), 0),
      season_ceiling = if (bank_on) szn_band[["ceiling"]] else round(quantile(szn, SEASON_CEIL_Q[pos]), 0),
      bust_pct = bust_pct,
      normal_pct = normal_pct,
      boom_pct = boom_pct,
      wopr = wopr_val,
      epa = epa_val,
      ryoe = ryoe_val,
      scramble_rate = scramble_rate_val,
      play_action_rate = play_action_rate_val,
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
  if (APPLY_SLEEPER_MISSING_OUT) {
    sm <- tryCatch(fetch_sleeper_median_projections(season, week), error = function(e) NULL)
    if (!is.null(sm) && length(sm) >= SLEEPER_MISSING_OUT_MIN_PAYLOAD) {
      keys <- paste0(normalize_sleeper_name(df$player_name), "|", df$position)
      ghost <- !(keys %in% names(sm)) & df$median >= SLEEPER_MISSING_OUT_MIN & !(df$player_name %in% out_players)
      if (any(ghost)) {
        cat("No Sleeper projection + our median >=", SLEEPER_MISSING_OUT_MIN, "-> treated as OUT:", sum(ghost), "player(s) -",
            paste(sprintf("%s (%.1f)", df$player_name[ghost], df$median[ghost]), collapse = ", "), "\n")
        out_players <- c(out_players, df$player_name[ghost])
      }
    } else {
      cat("Sleeper payload unavailable/too small -- skipping the no-projection OUT check\n")
    }
  }
  is_out <- df$player_name %in% out_players
  if (length(out_players) > 0) {
    cat("OUT this week (projection/ceiling set to 0):", sum(is_out), "player(s) -",
        paste(df$player_name[is_out], collapse = ", "), "\n")
  }

  # Promote a team's backup QB into the published tables when its starter
  # is OUT this week. project_all() keeps the top 2 depth-chart QBs per
  # team (see select_team_qbs()) specifically so this has a real row to
  # promote -- without it, a team whose starter goes down mid-week (e.g.
  # Jayden Daniels, WAS, Week 4 2026) would publish literally no QB at
  # all, even with a real backup (Marcus Mariota) about to start. The
  # starter's own row is left alone either way -- it still shows OUT/0 as
  # usual; this only decides whether the backup ALSO gets shown.
  #
  # Per team: the first QB on the chart who is NOT out (this week's starter,
  # whether he is listed first or the chart already moved a hurt starter
  # down), plus the injured real starter -- the OUT QB with the biggest
  # season median, if it beats the healthy starter's -- so he keeps his OUT
  # row here and his season simulation (Jalen Hurts, PHI Week 6 2026, was
  # listed QB4 while hurt and briefly vanished from both tables). Not every
  # OUT QB: backups with no Sleeper projection are flagged OUT above, and
  # keeping them published a dozen idle backups. Uses the whole chart, not
  # just its top 2, for the same reason.
  qb_depth <- tryCatch(select_team_qbs(season, df$player_name[df$position == "QB"], n = Inf),
                        error = function(e) NULL)
  if (!is.null(qb_depth) && nrow(qb_depth) > 0) {
    keep_qb <- character(0)
    for (tm in unique(qb_depth$team)) {
      chart <- qb_depth[qb_depth$team == tm, ]
      chart <- chart[order(chart$pos_rank), ]
      healthy <- chart$player_name[!(chart$player_name %in% out_players)]
      hurt <- chart$player_name[chart$player_name %in% out_players]
      starter <- if (length(healthy)) healthy[1] else character(0)
      sm <- function(p) df$season_median[match(p, df$player_name)]
      hurt_top <- if (length(hurt)) hurt[which.max(sm(hurt))] else character(0)
      if (length(hurt_top) && length(starter) && !(sm(hurt_top) > sm(starter))) hurt_top <- character(0)
      keep_qb <- c(keep_qb, starter, hurt_top)
      if (length(hurt_top) && length(starter)) {
        cat("Starter OUT -- promoting backup QB into this week's tables:", starter, "(for", tm, ")\n")
      }
    }
    is_extra_qb <- df$position == "QB" & !(df$player_name %in% keep_qb)
    if (any(is_extra_qb)) {
      cat("Non-starter/non-promoted QBs excluded from published tables:", sum(is_extra_qb), "-",
          paste(df$player_name[is_extra_qb], collapse = ", "), "\n")
      df <- df[!is_extra_qb, ]
      is_out <- df$player_name %in% out_players
    }
  }

  df$floor <- ifelse(is_out, 0, df$floor)
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
    team = redraft$team, opponent = redraft$opponent, is_home = redraft$is_home, projection = redraft$median,
    # Weekly floor/ceiling -- same calibrated FLOOR_Q/CEIL_Q + matchup
    # adjustment as `projection`, already computed above per row; this is
    # the first thing that actually exports them (redraft_rankings.floor/
    # ceiling, migration 0029). Distinct from player_simulations' season-
    # total floor/ceiling below. The Redraft Rankings PAGE displays these
    # instead of projection now -- `projection`/`rank` stay in the table
    # and this CSV purely as the internal ranking/ordering basis and for
    # My Team's myProjPts, which still reads the `projection` column.
    floor = redraft$floor, ceiling = redraft$ceiling,
    matchup_mult = redraft$matchup_mult,
    trend = redraft$trend,
    sample_confidence = ifelse(redraft$shrunk, "building", "established"),
    scoring_stats = redraft_scoring_stats,
    # OUT takes priority. BOUNCEBACK is informational only now (see the
    # BOUNCEBACK_MED_Q comment above -- walk-forward validation showed
    # acting on it makes the number worse, not better) -- flagged here so
    # a human publishing/reviewing this week's numbers can see "this
    # player just had a rough game" as real context, without it having
    # changed the projection itself.
    notes = ifelse(redraft$player_name %in% out_players, "OUT",
             ifelse(redraft$bounceback, "BOUNCEBACK (informational only)", ""))
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

  # Top PLAYER_SIMULATIONS_POOL_SIZE by season median, overall -- see that
  # constant's own comment up top for why this pool is capped at all.
  sims <- df[order(-df$season_median), ]
  sims <- sims[seq_len(min(PLAYER_SIMULATIONS_POOL_SIZE, nrow(sims))), ]
  write.csv(data.frame(
    season = season, week = week, player_name = sims$player_name, position = sims$position,
    team = sims$team, floor = sims$season_floor, median = sims$season_median,
    ceiling = sims$season_ceiling,
    trend = sims$trend,
    sample_confidence = ifelse(sims$shrunk, "building", "established"),
    stat_ranges = sims$stat_ranges_json,
    bust_pct = sims$bust_pct, normal_pct = sims$normal_pct, boom_pct = sims$boom_pct,
    wopr = sims$wopr, epa = sims$epa,
    ryoe = sims$ryoe, scramble_rate = sims$scramble_rate, play_action_rate = sims$play_action_rate,
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
