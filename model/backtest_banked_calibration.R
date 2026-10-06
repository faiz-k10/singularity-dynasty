# Backtest: how wide should Player Season Simulations' floor/ceiling be once a
# player's real games so far are locked in ("banked" mode in projection_engine.R,
# BANK_SEASON_TOTALS)?
#
# For each test season Y and each as-of week w, this rebuilds exactly what the
# engine would have published before week w: history = the 3 prior seasons plus
# Y's games through week w-1; availability from player_availability() with
# completed_weeks = w-1; his real totals so far banked; and ONLY his team's
# remaining games simulated (MAX_GAMES_PER_SEASON minus its games played). The
# simulated REMAINING distribution is stored as a grid of quantiles, together
# with the real banked total and the real full-season outcome, so the next step
# (analyze_banked_calibration.R) can test any floor/ceiling rule against reality
# without re-simulating.
#
# Differences from backtest_season_calibration.R, deliberately:
#   - availability comes from history exactly as production computes it (the old
#     script fed in the season's actual games played, which a live run can't know)
#   - nobody is dropped for playing few games (the old script skipped anyone with
#     < 4 games, which hides the injured-season outcomes a floor exists to cover)
#   - evaluated at many points in the season, not just preseason
#   - population = the top PLAYER_SIMULATIONS_POOL_SIZE by simulated median per
#     (season, week), i.e. what the page would actually have published
#
# Run (one process per test season, in parallel):
#   Rscript backtest_banked_calibration.R 2023   # writes backtest_banked_2023.rds
suppressMessages(source("projection_engine.R"))   # functions/constants only

args <- commandArgs(trailingOnly = TRUE)
Y <- as.integer(args[1])
AS_OF_WEEKS <- c(2, 3, 5, 7, 9, 11, 13, 15)
N_SIMS <- 6000
HEALTHY_SHARE <- 0.75
PROBS <- seq(0.01, 0.99, by = 0.01)
KEY_YARDS <- c(QB = "passing_yards", RB = "rushing_yards", WR = "receiving_yards", TE = "receiving_yards")
KEY_TDS   <- c(QB = "passing_tds",   RB = "rushing_tds",   WR = "receiving_tds",   TE = "receiving_tds")

reg_all <- load_history((Y - 3):Y)
cat(sprintf("Season %d: %d player-game rows loaded\n", Y, nrow(reg_all)))
set.seed(7000 + Y)

# Sums of N_SIMS bootstrap draws: how many games each run plays (g), then that many
# games drawn with the recency weights; returns a matrix [N_SIMS x ncol(vals)].
sim_sums <- function(vals, w, g) {
  out <- matrix(0, nrow = length(g), ncol = ncol(vals))
  total <- sum(g)
  if (total == 0) return(out)
  idx <- sample.int(nrow(vals), total, replace = TRUE, prob = w)
  grp <- rep.int(seq_along(g), g)
  s <- rowsum(vals[idx, , drop = FALSE], grp)
  out[as.integer(rownames(s)), ] <- s
  out
}

records <- list()
for (w in AS_OF_WEEKS) {
  completed <- w - 1
  as_of <- reg_all[reg_all$season < Y | (reg_all$season == Y & reg_all$week < w), ]
  cur_rows <- as_of[as_of$season == Y, ]
  team_games <- tapply(cur_rows$week, cur_rows$team, function(x) length(unique(x)))
  full_year <- reg_all[reg_all$season == Y, ]

  counts <- table(as_of$player_display_name)
  last_season <- unique(as_of$player_display_name[as_of$season == Y - 1])
  eligible <- intersect(names(counts[counts >= MIN_GAMES]), last_season)
  eval_rows <- list()

  for (p in eligible) {
    d <- as_of[as_of$player_display_name == p, ]
    pos <- d$position[1]
    n <- nrow(d)
    cur <- d[d$season == Y, ]
    avail <- player_availability(d, Y, completed)
    tg <- if (nrow(cur) > 0) unname(team_games[tail(cur$team, 1)]) else NA_real_
    if (length(tg) != 1 || is.na(tg)) tg <- completed
    tg <- max(tg, nrow(cur))
    n_draw <- max(MAX_GAMES_PER_SEASON - tg, 0)
    g <- rbinom(N_SIMS, n_draw, avail)   # same as summing n_draw Bernoulli(avail) trials

    yard_cols <- c(KEY_YARDS[[pos]], if (pos %in% c("WR", "TE")) "targets")
    pts <- sim_sums(matrix(d$fantasy_points_ppr, ncol = 1), recency_weights(n, MED_DECAY[[pos]]), g)[, 1]
    yds <- sim_sums(as.matrix(d[, yard_cols, drop = FALSE]), recency_weights(n, STAT_GROUP_DECAY[["yardage"]][[pos]]), g)
    tds <- sim_sums(as.matrix(d[, KEY_TDS[[pos]], drop = FALSE]), recency_weights(n, STAT_GROUP_DECAY[["td_int"]][[pos]]), g)[, 1]

    real <- full_year[full_year$player_display_name == p, ]
    banked <- list(pts = sum(cur$fantasy_points_ppr), yds = colSums(cur[, yard_cols, drop = FALSE]), tds = sum(cur[[KEY_TDS[[pos]]]]))
    # Same simulation restricted to runs where he plays at least 75% of the
    # remaining games ("stays on the field") -- for a floor/ceiling that doesn't
    # price in a lost season. Quantiles of that subset, stored beside the full ones.
    healthy <- g >= ceiling(HEALTHY_SHARE * n_draw)
    hq <- function(v) if (sum(healthy) >= 200) unname(quantile(v[healthy], PROBS)) else rep(NA_real_, length(PROBS))
    rec <- list(
      player = p, pos = pos, season = Y, week = w, games_banked = nrow(cur), team_games = tg, games_left = n_draw, avail = avail,
      yard_cols = yard_cols,
      q_pts = unname(quantile(pts, PROBS)), q_tds = unname(quantile(tds, PROBS)),
      q_yds = lapply(seq_along(yard_cols), function(j) unname(quantile(yds[, j], PROBS))),
      mean_pts = mean(pts),
      p_healthy = mean(healthy), q_pts_h = hq(pts), q_tds_h = hq(tds),
      q_yds_h = lapply(seq_along(yard_cols), function(j) hq(yds[, j])),
      banked_pts = banked$pts, banked_tds = banked$tds, banked_yds = banked$yds,
      real_pts = sum(real$fantasy_points_ppr), real_tds = sum(real[[KEY_TDS[[pos]]]]),
      real_yds = colSums(real[, yard_cols, drop = FALSE]), real_games = nrow(real)
    )
    names(rec$q_yds) <- yard_cols; names(rec$q_yds_h) <- yard_cols
    # Pool membership: ranked by simulated season median (banked + remaining median).
    rec$season_median <- rec$banked_pts + rec$q_pts[50]
    eval_rows[[p]] <- rec
  }
  med <- sapply(eval_rows, function(r) r$season_median)
  keep <- names(sort(med, decreasing = TRUE))[seq_len(min(PLAYER_SIMULATIONS_POOL_SIZE, length(med)))]
  records <- c(records, unname(eval_rows[keep]))
  cat(sprintf("  as-of week %2d: %d eligible, %d in pool\n", w, length(eligible), length(keep)))
}
saveRDS(records, sprintf("backtest_banked_%d.rds", Y))
cat(sprintf("Wrote backtest_banked_%d.rds (%d evaluation points)\n", Y, length(records)))
