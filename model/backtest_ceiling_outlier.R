# Backtest: should ONE big game be allowed to set a player's weekly ceiling?
#
# Today the weekly ceiling is weighted_quantile(history, recency weights, CEIL_Q) with CEIL_Q = 0.975-0.995. On a
# history of ~20-50 games that internal quantile is effectively "his best recent game": e.g. Kyle Pitts (median 7.9)
# is published with a 43.4 ceiling because of one 45.6-point game last season; Oronde Gadsden (median 5.0) gets 27.5.
# The overall exceed rate is calibrated, but it is the AVERAGE over players -- players whose max is an outlier get
# ceilings that are too high, others too low.
#
# This script compares the live method (A) with methods whose ceiling is built from the player's TYPICAL upper tail
# instead of his single best game, each calibrated (one scale parameter per position) to the same real exceed rate the
# live ceiling is meant to deliver (4% QB/RB/TE, 6% WR), walk-forward 2022-2025 on next-game outcomes:
#
#   A  live: weighted quantile at a calibrated q
#   B  anchored spread: median + k * (weighted q_a - median), a in {0.80, 0.90}   (k calibrated)
#   D  top-games average (the founder's idea): the average of his k best games in the window, times a calibrated
#      factor f, so a single outlier is smoothed by the next-best games (k in 2..6)
#   C  capped game: every game is capped at median + c * (q90 - median) before taking the live quantile (q calibrated for
#      the fixed c), so a single outlier counts as "a big game" but not as "45 points"
#
# Scored by (1) real exceed rate overall and by year, (2) exceed rate where the live ceiling leans on one game
# (top game > 1.6x the next-best), (3) pinball loss at the target quantile (lower = a tighter ceiling at the same
# coverage), (4) mean ceiling.
#
# Run: Rscript backtest_ceiling_outlier.R
suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 6
CEIL_DECAY <- c(RB = 0.89, QB = 0.98, WR = 0.93, TE = 0.91)
LIVE_CEIL_Q <- c(RB = 0.995, QB = 0.985, WR = 0.975, TE = 0.995)
TARGET <- c(RB = 0.04, QB = 0.04, WR = 0.06, TE = 0.04)

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
wq <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]
  cw <- cumsum(w) / sum(w)
  k <- which(cw >= q)[1]
  if (k == 1) return(x[1])
  x[k - 1] + ((q - cw[k - 1]) / (cw[k] - cw[k - 1])) * (x[k] - x[k - 1])
}

all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
d_all <- raw[raw$season_type == "REG", c("player_id", "position", "season", "week", "fantasy_points_ppr")]
d_all <- d_all[d_all$position %in% names(TARGET) & !(d_all$week %in% EXCLUDE_WEEKS) & !is.na(d_all$fantasy_points_ppr), ]
d_all <- d_all[order(d_all$player_id, d_all$season, d_all$week), ]

pinball <- function(actual, pred, tau) mean(ifelse(actual >= pred, tau * (actual - pred), (1 - tau) * (pred - actual)))

Q_GRID <- c(seq(0.90, 0.995, by = 0.005), 0.999)
K_GRID <- seq(0.6, 4, by = 0.05)
C_GRID <- c(1.5, 2, 2.5, 3)
rows_out <- list()

for (pos in names(TARGET)) {
  dp <- d_all[d_all$position == pos, ]
  ev <- list()
  for (pid in unique(dp$player_id)) {
    d <- dp[dp$player_id == pid, ]; n <- nrow(d)
    if (n < MIN_HIST_GAMES + 1) next
    for (k in (MIN_HIST_GAMES + 1):n) {
      if (!(d$season[k] %in% TEST_SEASONS)) next
      h <- d$fantasy_points_ppr[1:(k - 1)]
      w <- recency_weights(length(h), CEIL_DECAY[pos])
      m <- wq(h, w, 0.5)
      ev[[length(ev) + 1]] <- list(h = h, w = w, m = m, q80 = wq(h, w, 0.80), q90 = wq(h, w, 0.90),
                                    actual = d$fantasy_points_ppr[k], season = d$season[k],
                                    top_ratio = { s <- sort(h, decreasing = TRUE); if (s[2] > 1) s[1] / s[2] else NA_real_ })
    }
  }
  N <- length(ev); tau <- 1 - TARGET[pos]
  actual <- vapply(ev, function(e) e$actual, 0); season <- vapply(ev, function(e) e$season, 0)
  topr <- vapply(ev, function(e) e$top_ratio, 0)
  cat(sprintf("\n===== %s  (%d eval games, target exceed rate %.0f%%) =====\n", pos, N, 100 * TARGET[pos]))

  calib <- function(fn, grid) {   # pick the grid value whose real exceed rate is closest to target
    rates <- vapply(grid, function(g) mean(actual > vapply(ev, function(e) fn(e, g), 0)), 0)
    grid[which.min(abs(rates - TARGET[pos]))]
  }
  preds <- list()
  preds$A_live_q <- vapply(ev, function(e) wq(e$h, e$w, LIVE_CEIL_Q[pos]), 0)
  qA <- calib(function(e, g) wq(e$h, e$w, g), Q_GRID)
  preds$A_recal <- vapply(ev, function(e) wq(e$h, e$w, qA), 0)
  for (a in c(0.80, 0.90)) {
    fnB <- function(e, k) e$m + k * ((if (a == 0.80) e$q80 else e$q90) - e$m)
    kB <- calib(fnB, K_GRID)
    preds[[sprintf("B_spread_q%02d", round(100 * a))]] <- vapply(ev, function(e) fnB(e, kB), 0)
    cat(sprintf("  B(q%.2f): k=%.2f\n", a, kB))
  }
  for (cc in C_GRID) {
    fnC <- function(e, q) { cap <- e$m + cc * (e$q90 - e$m); wq(pmin(e$h, cap), e$w, q) }
    qC <- calib(fnC, Q_GRID)
    preds[[sprintf("C_cap_c%.1f", cc)]] <- vapply(ev, function(e) fnC(e, qC), 0)
    cat(sprintf("  C(c=%.1f): q=%.3f\n", cc, qC))
  }
  F_GRID <- seq(0.5, 2.5, by = 0.02)
  for (kk in c(2, 3, 4, 5, 6)) {
    topmean <- function(e) mean(sort(e$h, decreasing = TRUE)[seq_len(min(kk, length(e$h)))])
    tm <- vapply(ev, topmean, 0)
    fD <- F_GRID[which.min(abs(vapply(F_GRID, function(f) mean(actual > f * tm), 0) - TARGET[pos]))]
    preds[[sprintf("D_top%d_avg", kk)]] <- fD * tm
    cat(sprintf("  D(top %d): f=%.2f\n", kk, fD))
  }
  cat(sprintf("  A recalibrated q=%.3f (live %.3f)\n", qA, LIVE_CEIL_Q[pos]))

  lean <- !is.na(topr) & topr > 1.6
  cat(sprintf("  share of eval games whose history leans on one game (top > 1.6x next): %.0f%%\n", 100 * mean(lean)))
  cat(sprintf("  %-16s %8s %8s %8s %8s %8s %8s %8s %8s\n", "method", "exceed%", "lean%", "other%", "y2022", "y2025", "pinball", "meanCeil", "leanCeil"))
  for (nm in names(preds)) {
    p <- preds[[nm]]; ex <- actual > p
    rows_out[[length(rows_out) + 1]] <- data.frame(pos = pos, method = nm, exceed = mean(ex), lean = mean(ex[lean]), other = mean(ex[!lean]),
                                                    pinball = pinball(actual, p, tau), mean_ceil = mean(p), lean_ceil = mean(p[lean]))
    cat(sprintf("  %-16s %8.1f %8.1f %8.1f %8.1f %8.1f %8.3f %8.1f %8.1f\n", nm, 100 * mean(ex), 100 * mean(ex[lean]), 100 * mean(ex[!lean]),
                100 * mean(ex[season == 2022]), 100 * mean(ex[season == 2025]), pinball(actual, p, tau), mean(p), mean(p[lean])))
  }
}
saveRDS(do.call(rbind, rows_out), "backtest_ceiling_outlier_results.rds")
