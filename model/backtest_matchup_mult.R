# Backtest: does compute_matchup_multipliers() (projection_engine.R)
# actually reduce weekly prediction error, or is it just an unvalidated
# multiplier that's been quietly moving real numbers? README.md previously
# claimed Redraft matchup-adjustment was "deferred, nothing in this engine
# does that yet" -- the code disagreed (`med <- med * mult`, live in
# project_all()) and, unlike every other parameter in this file, it never
# went through a walk-forward check. This script is that check.
#
# Method: for each test season/week (2022-2025, weeks 2-17 -- week 1 has
# no in-season defensive data yet, matching production's own real
# preseason behavior of falling back to prior-season-only; week 18
# excluded everywhere in this codebase), for every real player-week:
#   - BASELINE: the player's own weighted-quantile median from their own
#     history (their own MED_DECAY, no opponent adjustment at all).
#   - TREATMENT: that same number times the defense's opponent-strength
#     multiplier for that week, computed the SAME way
#     compute_matchup_multipliers() does (shrink-toward-1.0 by sample
#     size, capped [0.90, 1.10]) -- but restricted to real
#     already-elapsed weeks only (season Y-1 in full, season Y weeks
#     before this one), never the week being predicted or anything after
#     it. compute_matchup_multipliers() itself has no week cutoff
#     (correct for real-time use, where future weeks simply don't exist
#     in the data yet -- unsafe for backtesting past weeks, where they
#     do), so this script reimplements its exact formula with that cutoff
#     added rather than calling it directly.
# Scored via mean absolute error against real fantasy_points_ppr.
#
# Run: Rscript backtest_matchup_mult.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
PLAYER_LOOKBACK_YEARS <- 3   # matches history_seasons()
MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
MATCHUP_FULL_SAMPLE_GAMES <- 8
MATCHUP_MULT_FLOOR <- 0.90
MATCHUP_MULT_CEIL <- 1.10
MIN_HIST_GAMES <- 6

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
all_seasons <- (min(TEST_SEASONS) - PLAYER_LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
d_all <- raw[raw$season_type == "REG",
             c("player_display_name", "position", "season", "week",
               "opponent_team", "fantasy_points_ppr")]
d_all <- d_all[d_all$position %in% c("QB", "RB", "WR", "TE"), ]
d_all <- d_all[!(d_all$week %in% EXCLUDE_WEEKS), ]
d_all <- d_all[!is.na(d_all$fantasy_points_ppr), ]
d_all <- d_all[order(d_all$player_display_name, d_all$season, d_all$week), ]
cat("Loaded", nrow(d_all), "player-game rows.\n\n")

# Exact compute_matchup_multipliers() formula, restricted to a caller-given
# (season, week) cutoff instead of "the whole season(s), whatever's loaded".
matchup_mult_asof <- function(before_season, before_week) {
  d <- d_all[!is.na(d_all$opponent_team) &
               (d_all$season == before_season - 1 |
                  (d_all$season == before_season & d_all$week < before_week)), ]
  if (nrow(d) == 0) return(NULL)
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

base_err <- c(); treat_err <- c(); ev_pos <- c()

# Pre-split by player once -- avoids re-scanning the full ~40k-row table
# for every single player-week evaluated (would be tens of thousands of
# full-table filters otherwise).
by_player <- split(d_all, d_all$player_display_name)

for (Y in TEST_SEASONS) {
  for (wk in 2:17) {
    week_games <- d_all[d_all$season == Y & d_all$week == wk & !is.na(d_all$opponent_team), ]
    if (nrow(week_games) == 0) next
    mult_lookup <- matchup_mult_asof(Y, wk)
    if (is.null(mult_lookup)) next

    for (r in seq_len(nrow(week_games))) {
      p <- week_games$player_display_name[r]
      pos <- week_games$position[r]
      opp <- week_games$opponent_team[r]
      actual <- week_games$fantasy_points_ppr[r]

      pd <- by_player[[p]]
      hist <- pd[(pd$season < Y | (pd$season == Y & pd$week < wk)) &
                   pd$season >= Y - PLAYER_LOOKBACK_YEARS, ]
      n_hist <- nrow(hist)
      if (n_hist < MIN_HIST_GAMES) next

      w <- recency_weights(n_hist, MED_DECAY[[pos]])
      pred_base <- weighted_quantile(hist$fantasy_points_ppr, w, 0.50)

      key <- paste(opp, pos)
      mult <- if (key %in% names(mult_lookup)) mult_lookup[[key]] else 1
      pred_treat <- pred_base * mult

      base_err <- c(base_err, abs(actual - pred_base))
      treat_err <- c(treat_err, abs(actual - pred_treat))
      ev_pos <- c(ev_pos, pos)
    }
  }
  cat("Finished season", Y, "\n")
}

report <- function(base, treat, label) {
  mb <- mean(base); mt <- mean(treat)
  cat(sprintf("%s  n=%d  baseline MAE=%.3f  w/matchup MAE=%.3f  change=%+.2f%%\n",
              label, length(base), mb, mt, 100 * (mt - mb) / mb))
}

cat("\n=== Results ===\n")
report(base_err, treat_err, "ALL")
for (pos in c("QB", "RB", "WR", "TE")) {
  idx <- ev_pos == pos
  report(base_err[idx], treat_err[idx], pos)
}
