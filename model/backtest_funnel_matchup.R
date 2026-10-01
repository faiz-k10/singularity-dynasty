# Backtest: does a "funnel"-gated matchup adjustment beat both no matchup
# adjustment at all (today's status quo -- APPLY_MATCHUP_MULTIPLIER is
# FALSE in projection_engine.R) and the existing generic per-position
# multiplier (backtest_matchup_mult.R already found compute_matchup_
# multipliers() applied uniformly to all 32 defenses; see that script for
# the baseline-vs-generic-multiplier result)?
#
# Motivation: a defense being generous overall isn't the same as being a
# FUNNEL. A funnel defense is lopsided -- bad against the run but good
# against the pass ("run funnel", real offenses lean run against it,
# boosting RB volume/production and suppressing WR/TE), or the reverse
# ("pass funnel"). The signal for that is the DIVERGENCE between a
# defense's rushing-points-allowed-vs-league-average and its
# receiving-points-allowed-vs-league-average, not either number alone --
# a defense that's simply bad at everything has a small divergence and
# isn't a funnel, even if both raw numbers are high.
#
# This script:
#   1. Computes each defense's RB raw multiplier (rushing side) and mean
#      WR/TE raw multiplier (receiving side), same underlying formula as
#      compute_matchup_multipliers(), "as of" a given week (no future-data
#      leakage -- same discipline as backtest_matchup_mult.R).
#   2. Ranks all 32 defenses by |RB_mult - WR/TE_mult| (funnel divergence)
#      each week.
#   3. Sweeps TOP_N (how many of the 32 most-divergent defenses actually
#      get a nonzero adjustment; everyone outside the top N gets mult=1,
#      i.e. no effect) from 0 (equivalent to baseline) up to 32
#      (equivalent to the old generic approach) to find where -- if
#      anywhere -- gating actually helps.
#   4. For a top-N defense: RB predictions get that defense's own RB
#      raw_mult, WR/TE/QB predictions get the mean WR/TE raw_mult (QB
#      lumped in with the passing side since QB fantasy production is
#      passing-dominated) -- each position only ever receives ONE
#      multiplier, so this doesn't double-count a defense's effect across
#      a player's own stat groups the way stacking this on top of the old
#      generic compute_matchup_multipliers() would.
# Scored via mean absolute error against real fantasy_points_ppr,
# same next-game-accuracy target as backtest_matchup_mult.R.
#
# Run: Rscript backtest_funnel_matchup.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
PLAYER_LOOKBACK_YEARS <- 3   # matches history_seasons()
MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
MATCHUP_FULL_SAMPLE_GAMES <- 8
MATCHUP_MULT_FLOOR <- 0.90
MATCHUP_MULT_CEIL <- 1.10
MIN_HIST_GAMES <- 6
TOP_N_GRID <- c(0, 4, 5, 6, 7, 8, 10, 15, 20, 25, 32)  # 0 = baseline, 32 = every defense (~generic approach)

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_quantile <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]
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

# Same "as of" cutoff discipline as backtest_matchup_mult.R -- only real,
# already-elapsed games (season Y-1 in full, season Y weeks before this
# one) ever feed the multiplier for week `before_week` of season
# `before_season`. Returns per-defense RB raw_mult, mean WR/TE raw_mult,
# and their divergence, all already shrunk toward 1.0 by sample size and
# capped -- so magnitudes are directly comparable to the live
# MATCHUP_MULT_FLOOR/CEIL clamp used everywhere else in this codebase.
funnel_asof <- function(before_season, before_week) {
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

  rb <- setNames(m$mult[m$position == "RB"], m$defense[m$position == "RB"])
  wr <- setNames(m$mult[m$position == "WR"], m$defense[m$position == "WR"])
  te <- setNames(m$mult[m$position == "TE"], m$defense[m$position == "TE"])
  defenses <- union(names(rb), union(names(wr), names(te)))
  rb_v <- ifelse(defenses %in% names(rb), rb[defenses], 1)
  wr_v <- ifelse(defenses %in% names(wr), wr[defenses], 1)
  te_v <- ifelse(defenses %in% names(te), te[defenses], 1)
  pass_v <- (wr_v + te_v) / 2
  divergence <- abs(rb_v - pass_v)
  names(rb_v) <- defenses; names(pass_v) <- defenses; names(divergence) <- defenses

  list(rb_mult = rb_v, pass_mult = pass_v, divergence = sort(divergence, decreasing = TRUE))
}

# Pre-split by player once, same perf reasoning as backtest_matchup_mult.R.
by_player <- split(d_all, d_all$player_display_name)

# eval_rows: one row per real player-week evaluated, with its own baseline
# prediction (no matchup adjustment) plus enough info (position, opponent,
# opponent's rb_mult/pass_mult/funnel-rank-that-week) to compute any TOP_N
# treatment after the fact without re-doing the expensive weighted-quantile
# history lookup for every grid point.
eval_rows <- list(); i <- 0

for (Y in TEST_SEASONS) {
  for (wk in 2:17) {
    week_games <- d_all[d_all$season == Y & d_all$week == wk & !is.na(d_all$opponent_team), ]
    if (nrow(week_games) == 0) next
    fn <- funnel_asof(Y, wk)
    if (is.null(fn)) next
    rank_by_divergence <- names(fn$divergence)  # already sorted, most-funnel-like first

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

      opp_rank <- match(opp, rank_by_divergence)  # NA if opponent absent this week (bye data gap)
      opp_rb_mult <- if (opp %in% names(fn$rb_mult)) fn$rb_mult[[opp]] else 1
      opp_pass_mult <- if (opp %in% names(fn$pass_mult)) fn$pass_mult[[opp]] else 1
      side_mult <- if (pos == "RB") opp_rb_mult else opp_pass_mult  # QB/WR/TE share the passing side

      i <- i + 1
      eval_rows[[i]] <- list(pos = pos, actual = actual, pred_base = pred_base,
                              opp_rank = opp_rank, side_mult = side_mult)
    }
  }
  cat("Finished season", Y, "\n")
}

cat("\nTotal eval points:", length(eval_rows), "\n\n")

pos_v <- sapply(eval_rows, `[[`, "pos")
actual_v <- sapply(eval_rows, `[[`, "actual")
base_v <- sapply(eval_rows, `[[`, "pred_base")
rank_v <- sapply(eval_rows, function(e) if (is.null(e$opp_rank) || is.na(e$opp_rank)) Inf else e$opp_rank)
mult_v <- sapply(eval_rows, `[[`, "side_mult")

base_err <- abs(actual_v - base_v)

cat("=== TOP_N sweep (0 = baseline, no adjustment; 32 = every defense gets a say) ===\n")
cat(sprintf("%-6s %-10s %-14s %-10s\n", "TOP_N", "N_obs", "MAE", "Change%"))
for (n_top in TOP_N_GRID) {
  applied <- rank_v <= n_top
  pred_treat <- ifelse(applied, base_v * mult_v, base_v)
  treat_err <- abs(actual_v - pred_treat)
  mb <- mean(base_err); mt <- mean(treat_err)
  cat(sprintf("%-6d %-10d %-14.4f %+.2f%%\n", n_top, length(treat_err), mt, 100 * (mt - mb) / mb))
}

cat("\n=== Best TOP_N, broken out by position ===\n")
best_n <- TOP_N_GRID[which.min(sapply(TOP_N_GRID, function(n_top) {
  applied <- rank_v <= n_top
  mean(abs(actual_v - ifelse(applied, base_v * mult_v, base_v)))
}))]
cat("Best overall TOP_N:", best_n, "\n")
for (pos in c("QB", "RB", "WR", "TE")) {
  idx <- pos_v == pos
  applied <- rank_v[idx] <= best_n
  pred_treat <- ifelse(applied, base_v[idx] * mult_v[idx], base_v[idx])
  mb <- mean(base_err[idx]); mt <- mean(abs(actual_v[idx] - pred_treat))
  cat(sprintf("%-4s n=%-6d baseline MAE=%.4f  TOP_N=%d MAE=%.4f  change=%+.2f%%\n",
              pos, sum(idx), mb, best_n, mt, 100 * (mt - mb) / mb))
}
