# Backtest: weekly points ceiling at the CURRENT calibration (real exceed ~4% QB/RB/TE, ~6% WR) vs re-swept to a 10%
# exceed rate (Oct 20 2026, founder asked for consistent 10th / 90th percentile floors and ceilings).
#
# Walk-forward next-game test, same data and discipline as backtest_ceiling_calibration.R (history before the game only,
# 2022-2025 plus the live 2026 weeks 1-6). For each player-game it builds the live floor (FLOOR_Q, MED_DECAY), median
# and ceiling (CEIL_DECAY) and judges them against the real game:
#   - real below-floor / above-ceiling rates;
#   - how high the ceiling sits over the median (what a user sees);
#   - the interval score of the floor-to-ceiling range read as an 80% interval (width + penalty for missing, alpha 0.2;
#     lower is better) -- the one number that says which range is the better 80% range;
#   - pinball loss of the ceiling at tau 0.90 and at tau 0.96 (how good a 90th / 96th percentile estimate it is).
#
# Run: Rscript backtest_weekly_ceiling_10pct.R

suppressMessages(library(nflreadr))

TEST_SEASONS <- 2022:2026
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 6
MED_DECAY  <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
CEIL_DECAY <- c(RB = 0.89, QB = 0.98, WR = 0.93, TE = 0.91)
FLOOR_Q    <- c(RB = 0.09, QB = 0.08, WR = 0.12, TE = 0.13)
CUR_CEIL_Q <- c(RB = 0.995, QB = 0.985, WR = 0.975, TE = 0.995)
Q_GRID <- sort(unique(c(seq(0.70, 0.99, by = 0.005), 0.9925, 0.995, 0.9975)))

rw <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
# interpolated weighted quantiles for several q at once (same rule as weighted_quantile() in projection_engine.R)
wq_multi <- function(x, w, qs) {
  o <- order(x); x <- x[o]; w <- w[o]; cw <- cumsum(w) / sum(w)
  vapply(qs, function(q) {
    k <- which(cw >= q)[1]
    if (is.na(k)) return(x[length(x)])
    if (k == 1) return(x[1])
    x[k - 1] + ((q - cw[k - 1]) / (cw[k] - cw[k - 1])) * (x[k] - x[k - 1])
  }, numeric(1))
}
pinball <- function(y, qhat, tau) mean(ifelse(y >= qhat, tau * (y - qhat), (1 - tau) * (qhat - y)))
interval_score <- function(y, lo, hi, alpha = 0.2) mean((hi - lo) + (2 / alpha) * pmax(lo - y, 0) + (2 / alpha) * pmax(y - hi, 0))

raw <- as.data.frame(load_player_stats(seasons = (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)))
d_all <- raw[raw$season_type == "REG" & raw$position %in% c("QB", "RB", "WR", "TE") & raw$week != 18 & !is.na(raw$fantasy_points_ppr),
             c("player_id", "position", "season", "week", "fantasy_points_ppr")]
d_all <- d_all[order(d_all$player_id, d_all$season, d_all$week), ]

eval_pos <- function(pos) {
  dpos <- d_all[d_all$position == pos, ]
  rows <- list(); i <- 0
  for (pid in unique(dpos$player_id)) {
    d <- dpos[dpos$player_id == pid, ]; n <- nrow(d)
    if (n < MIN_HIST_GAMES + 1) next
    for (k in (MIN_HIST_GAMES + 1):n) {
      if (!(d$season[k] %in% TEST_SEASONS)) next
      h <- d$fantasy_points_ppr[1:(k - 1)]; m <- length(h)
      wm <- rw(m, MED_DECAY[[pos]]); wc <- rw(m, CEIL_DECAY[[pos]])
      fl <- wq_multi(h, wm, FLOOR_Q[[pos]]); med <- wq_multi(h, wm, 0.5)
      ce <- wq_multi(h, wc, Q_GRID)
      i <- i + 1
      rows[[i]] <- c(season = d$season[k], actual = d$fantasy_points_ppr[k], floor = fl, median = med, ce)
    }
  }
  m <- do.call(rbind, rows); colnames(m)[5:ncol(m)] <- paste0("c", Q_GRID); m
}

summarise <- function(pos, m, label) {
  y <- m[, "actual"]
  cur <- m[, paste0("c", CUR_CEIL_Q[[pos]])]
  exceed <- sapply(Q_GRID, function(q) mean(y > m[, paste0("c", q)]))
  q10 <- Q_GRID[which.min(abs(exceed - 0.10))]
  new <- m[, paste0("c", q10)]
  lo <- m[, "floor"]; med <- m[, "median"]
  clamp <- function(hi) pmax(hi, med)  # the engine never lets the ceiling fall under the median
  data.frame(
    set = label, pos = pos, n = length(y),
    below_floor = round(100 * mean(y < lo), 1),
    cur_q = CUR_CEIL_Q[[pos]], cur_exceed = round(100 * mean(y > clamp(cur)), 1), cur_over_median = round(mean(clamp(cur) - med), 1),
    new_q = q10, new_exceed = round(100 * mean(y > clamp(new)), 1), new_over_median = round(mean(clamp(new) - med), 1),
    cur_interval80 = round(interval_score(y, lo, clamp(cur)), 2), new_interval80 = round(interval_score(y, lo, clamp(new)), 2),
    cur_pinball90 = round(pinball(y, clamp(cur), 0.90), 3), new_pinball90 = round(pinball(y, clamp(new), 0.90), 3),
    cur_pinball96 = round(pinball(y, clamp(cur), 0.96), 3), new_pinball96 = round(pinball(y, clamp(new), 0.96), 3)
  )
}

out <- list()
for (pos in c("QB", "RB", "WR", "TE")) {
  cat("evaluating", pos, "...\n")
  m <- eval_pos(pos)
  out[[length(out) + 1]] <- summarise(pos, m, "2022-2026 all")
  out[[length(out) + 1]] <- summarise(pos, m[m[, "season"] == 2026, , drop = FALSE], "2026 live wks 1-6 (new q refit on all)")
  # q chosen on 2022-2025 only, applied to 2026 -- the honest out-of-sample check of the 10% setting
  tr <- m[m[, "season"] < 2026, , drop = FALSE]; te <- m[m[, "season"] == 2026, , drop = FALSE]
  ex <- sapply(Q_GRID, function(q) mean(tr[, "actual"] > tr[, paste0("c", q)]))
  q10 <- Q_GRID[which.min(abs(ex - 0.10))]
  cat(sprintf("  %s: q for 10%% exceed fit on 2022-25 = %.4f; applied to 2026 weeks 1-6: %.1f%% above (n=%d)\n", pos, q10,
              100 * mean(te[, "actual"] > pmax(te[, paste0("c", q10)], te[, "median"])), nrow(te)))
}
res <- do.call(rbind, out)
options(width = 250); print(res, row.names = FALSE)
saveRDS(res, "backtest_weekly_ceiling_10pct_results.rds")
