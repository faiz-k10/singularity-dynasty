# Backtest: does the bounce-back adjustment (see README.md's "Bounce-back
# adjustment" section) actually REDUCE next-game prediction error out of
# sample, or does it just correlate descriptively the way the original
# analysis (bottom-20th-percentile week -> where does the player land
# next) showed?
#
# That original analysis proved the PATTERN is real. It did not prove
# that shifting the projection's quantile point in response to it (what
# project_all() now actually does) makes the projection more accurate --
# a real pattern can still be too noisy, or already too small relative to
# a player's own game-to-game variance, to be worth reacting to in a
# single-number prediction. This script closes that gap with a genuine
# walk-forward comparison, same zero-lookahead discipline as every other
# backtest in this directory.
#
# Method: for every real game across 2022-2025 (using only games BEFORE
# it, going back up to 3 prior seasons -- same lookback as
# history_seasons()), compute two competing single-number predictions
# for that game and score both against what the player actually scored:
#   - BASELINE: weighted_quantile(prior games, MED_DECAY weights, 0.50)
#   - TREATMENT: same, but at BOUNCEBACK_MED_Q[pos] instead of 0.50 IF the
#     player's immediately preceding game was in the bottom 20% of their
#     own prior (leave-one-out) history -- exactly project_all()'s logic.
# Scored via mean absolute error. Reported both across ALL games (most of
# which never trigger, so both predictions are identical there -- this is
# the realistic "how much does this actually move the needle overall"
# number) and TRIGGER-ONLY games (where the two predictions actually
# differ -- this isolates whether the adjustment itself helps on exactly
# the games it changes).
#
# Run: Rscript backtest_bounceback_validation.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
BOUNCEBACK_TRIGGER_Q <- 0.20
BOUNCEBACK_MED_Q <- c(RB = 0.529, QB = 0.556, WR = 0.548, TE = 0.556)
BOUNCEBACK_MIN_PRIOR_GAMES <- 6  # matches MIN_GAMES in projection_engine.R

recency_weights <- function(n, d) {
  w <- d^((n - 1):0)
  w / sum(w)
}

weighted_quantile <- function(x, w, q) {
  o <- order(x)
  x <- x[o]; w <- w[o]
  cw <- (cumsum(w) - 0.5 * w) / sum(w)
  as.numeric(approx(cw, x, q, rule = 2)$y)
}

cat("Loading nflreadr data...\n")
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
reg <- raw[raw$season_type == "REG",
           c("player_display_name", "position", "season", "week", "fantasy_points_ppr")]
reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
reg <- reg[!is.na(reg$fantasy_points_ppr), ]
reg <- reg[order(reg$player_display_name, reg$season, reg$week), ]
cat("Loaded", nrow(reg), "player-game rows.\n\n")

base_err <- c(); treat_err <- c(); ev_pos <- c()
trig_base_err <- c(); trig_treat_err <- c(); trig_pos <- c()

players <- unique(reg$player_display_name)
for (p in players) {
  d <- reg[reg$player_display_name == p, ]
  pos <- d$position[1]
  n <- nrow(d)
  if (n < BOUNCEBACK_MIN_PRIOR_GAMES + 2) next

  for (i in (BOUNCEBACK_MIN_PRIOR_GAMES + 1):n) {
    if (!(d$season[i] %in% TEST_SEASONS)) next  # only score real test-season games

    hist_x <- d$fantasy_points_ppr[1:(i - 1)]
    n_hist <- length(hist_x)
    w <- recency_weights(n_hist, MED_DECAY[[pos]])
    actual <- d$fantasy_points_ppr[i]

    pred_base <- weighted_quantile(hist_x, w, 0.50)

    had_bad <- FALSE
    if (n_hist - 1 >= BOUNCEBACK_MIN_PRIOR_GAMES) {
      prior_x <- hist_x[1:(n_hist - 1)]
      prior_w <- recency_weights(n_hist - 1, MED_DECAY[[pos]])
      bar <- weighted_quantile(prior_x, prior_w, BOUNCEBACK_TRIGGER_Q)
      had_bad <- hist_x[n_hist] <= bar
    }
    med_q <- if (had_bad) BOUNCEBACK_MED_Q[[pos]] else 0.50
    pred_treat <- weighted_quantile(hist_x, w, med_q)

    e_base <- abs(actual - pred_base)
    e_treat <- abs(actual - pred_treat)

    base_err <- c(base_err, e_base)
    treat_err <- c(treat_err, e_treat)
    ev_pos <- c(ev_pos, pos)

    if (had_bad) {
      trig_base_err <- c(trig_base_err, e_base)
      trig_treat_err <- c(trig_treat_err, e_treat)
      trig_pos <- c(trig_pos, pos)
    }
  }
}

report <- function(base, treat, label) {
  mb <- mean(base); mt <- mean(treat)
  cat(sprintf("%s  n=%d  baseline MAE=%.3f  treatment MAE=%.3f  change=%+.2f%%\n",
              label, length(base), mb, mt, 100 * (mt - mb) / mb))
}

cat("=== ALL evaluated games (most never trigger -- realistic overall impact) ===\n")
report(base_err, treat_err, "ALL")
for (pos in c("QB", "RB", "WR", "TE")) {
  idx <- ev_pos == pos
  report(base_err[idx], treat_err[idx], pos)
}

cat("\n=== TRIGGER-ONLY games (where baseline and treatment actually differ) ===\n")
report(trig_base_err, trig_treat_err, "ALL")
for (pos in c("QB", "RB", "WR", "TE")) {
  idx <- trig_pos == pos
  report(trig_base_err[idx], trig_treat_err[idx], pos)
}
