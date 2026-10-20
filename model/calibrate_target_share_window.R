# Re-calibration of the Target Share floor / ceiling quantiles for the "this season + last season only" window
# (Oct 20 2026, founder: floor and ceiling should be the 10th and 90th percentiles of what really happens).
# Same idea as calibrate_target_share_quantiles.R, but the history a player is simulated from is last season plus
# this season's games through AS_OF_WEEK (what the live run sees at week 7), and the real number it is judged against
# is his actual average target share over that whole season. The internal quantile is whichever one makes ~10% of
# players land below the floor and ~10% above the ceiling.
#
# Run: Rscript calibrate_target_share_window.R   (about a minute)

suppressMessages(library(nflreadr))

MAX_GAMES_PER_SEASON <- 16
METRIC <- "target_share"
POSITIONS <- c("WR", "TE")
DECAY <- c(WR = 0.94, TE = 0.94)       # unchanged from the earlier backtest
TEST_SEASONS <- 2022:2025
AS_OF_WEEKS <- c(4, 6, 8)              # report each, calibrate on the pooled set
N_SIMS <- 4000
MIN_WINDOW_GAMES <- 8                  # same eligibility as the live run, counted inside the window
MIN_ACTUAL_GAMES <- 6                  # the real season average needs a few games to mean anything

FLOOR_Q_GRID <- sort(unique(c(seq(0.00001, 0.0005, by = 0.00002), seq(0.0005, 0.02, by = 0.0005), seq(0.02, 0.25, by = 0.01))))
CEIL_Q_GRID  <- sort(unique(c(seq(0.75, 0.99, by = 0.01), seq(0.99, 0.9995, by = 0.0005))))

raw <- as.data.frame(load_player_stats(seasons = (min(TEST_SEASONS) - 3):max(TEST_SEASONS)))
reg <- raw[raw$season_type == "REG" & raw$position %in% POSITIONS & !is.na(raw[[METRIC]]),
           c("player_id", "player_display_name", "position", "season", "week", METRIC)]

recency_weights <- function(n_games, decay) { w <- decay ^ ((n_games - 1):0); w / sum(w) }

# Mirrors player_availability() in projection_engine.R closely enough for a calibration: games played in each of the
# last three seasons / 16, weighted toward the recent ones (this season counts as games so far / weeks so far).
availability <- function(d, Y, as_of) {
  yrs <- (Y - 2):Y
  a <- sapply(yrs, function(s) {
    denom <- if (s == Y) max(as_of, 1) else MAX_GAMES_PER_SEASON
    min(sum(d$season == s) / denom, 1)
  })
  w <- 0.6 ^ ((length(yrs) - 1):0); w <- w / sum(w)
  min(sum(a * w), 1)
}

sim_means <- function(vals, w, avail, n_sims) {
  g_draws <- rbinom(n_sims, MAX_GAMES_PER_SEASON, avail)
  out <- rep(NA_real_, n_sims)
  for (g in sort(unique(g_draws[g_draws > 0]))) {
    ix <- which(g_draws == g)
    s <- sample.int(length(vals), g * length(ix), replace = TRUE, prob = w)
    out[ix] <- colMeans(matrix(vals[s], nrow = g, ncol = length(ix)))
  }
  out[!is.na(out)]
}

res <- list()
set.seed(42)
for (pos in POSITIONS) {
  below <- list(); above <- list(); n_by_wk <- list()
  below_all <- setNames(numeric(length(FLOOR_Q_GRID)), FLOOR_Q_GRID); above_all <- setNames(numeric(length(CEIL_Q_GRID)), CEIL_Q_GRID); n_all <- 0
  for (wk in AS_OF_WEEKS) {
    b <- setNames(numeric(length(FLOOR_Q_GRID)), FLOOR_Q_GRID); a_ <- setNames(numeric(length(CEIL_Q_GRID)), CEIL_Q_GRID); n <- 0
    for (Y in TEST_SEASONS) {
      d_pos <- reg[reg$position == pos, ]
      window <- d_pos[(d_pos$season == Y - 1) | (d_pos$season == Y & d_pos$week <= wk), ]
      full_hist <- d_pos[d_pos$season >= Y - 2 & (d_pos$season < Y | d_pos$week <= wk), ]
      actual_all <- d_pos[d_pos$season == Y, ]
      for (p in unique(window$player_display_name)) {
        d <- window[window$player_display_name == p, ]
        d <- d[order(d$season, d$week), ]
        if (nrow(d) < MIN_WINDOW_GAMES) next
        act <- actual_all[actual_all$player_display_name == p, ]
        if (nrow(act) < MIN_ACTUAL_GAMES) next
        actual <- mean(act[[METRIC]])
        av <- availability(full_hist[full_hist$player_display_name == p, ], Y, wk)
        sim <- sim_means(d[[METRIC]], recency_weights(nrow(d), DECAY[[pos]]), av, N_SIMS)
        if (length(sim) < 100) next
        n <- n + 1
        b <- b + as.numeric(actual < quantile(sim, FLOOR_Q_GRID))
        a_ <- a_ + as.numeric(actual > quantile(sim, CEIL_Q_GRID))
      }
    }
    below_all <- below_all + b; above_all <- above_all + a_; n_all <- n_all + n
    n_by_wk[[as.character(wk)]] <- n
    below[[as.character(wk)]] <- 100 * b / n; above[[as.character(wk)]] <- 100 * a_ / n
  }
  fr <- 100 * below_all / n_all; cr <- 100 * above_all / n_all
  bf <- FLOOR_Q_GRID[which.min(abs(fr - 10))]; bc <- CEIL_Q_GRID[which.min(abs(cr - 10))]
  cat(sprintf("\n=== %s: pooled n=%d (as-of weeks %s) ===\n", pos, n_all, paste(AS_OF_WEEKS, collapse = "/")))
  cat(sprintf("  CALIBRATED floor_q=%s -> %.1f%% of real season averages below the floor\n", format(bf), fr[which.min(abs(fr - 10))]))
  cat(sprintf("  CALIBRATED ceil_q =%s -> %.1f%% above the ceiling\n", format(bc), cr[which.min(abs(cr - 10))]))
  for (wk in as.character(AS_OF_WEEKS)) {
    cat(sprintf("  as-of week %s (n=%d): below floor %.1f%%, above ceiling %.1f%%\n", wk, n_by_wk[[wk]],
                below[[wk]][as.character(bf)], above[[wk]][as.character(bc)]))
  }
  old_f <- c(WR = 0.00001, TE = 0.00013)[[pos]]; old_c <- c(WR = 0.993, TE = 0.992)[[pos]]
  cat(sprintf("  (old quantiles %s / %s on this window: %.1f%% below, %.1f%% above)\n", format(old_f), format(old_c),
              fr[which.min(abs(FLOOR_Q_GRID - old_f))], cr[which.min(abs(CEIL_Q_GRID - old_c))]))
  res[[pos]] <- list(floor_q = bf, ceil_q = bc)
}
saveRDS(res, "calibrate_target_share_window_results.rds")
