# Step 2 of the banked-totals calibration: reads backtest_banked_<season>.rds
# (from backtest_banked_calibration.R) and works out how wide the floor and
# ceiling of the REMAINING-games simulation need to be so that real full-season
# totals actually land on or outside them about 10% of the time each.
#
# Why not just query the simulation at the 10th/90th percentile: the simulation
# is optimistic from the very point it is run -- players miss more of the
# remaining games than their history implies, and produce a little less per game
# -- so a plain 10th percentile is breached 40%+ of the time early in the season
# (see the printed "plain" columns). Instead, each tail is stretched from the
# simulation's median by one factor, k, fitted per position and as-of week:
#
#   floor   = banked + rem_median - k_lo * (rem_median - rem_q10)
#   ceiling = banked + rem_median + k_hi * (rem_q90    - rem_median)
#
# The player's own simulated shape (a durable workhorse vs a boom/bust or
# injury-prone player) still sets how wide HIS band is; k only scales it to what
# the real outcomes did. k is fitted on the other three seasons and scored on the
# held-out one (leave-one-season-out), so the hit rates below are out-of-sample.
#
# A "hit" is the real total landing at or below the published (rounded) floor, or
# at or above the published ceiling.
#
# Run: Rscript analyze_banked_calibration.R   (writes banked_calibration_table.csv)
SEASONS <- 2022:2025
recs <- do.call(c, lapply(SEASONS, function(Y) readRDS(sprintf("backtest_banked_%d.rds", Y))))
TARGET <- 0.10
K_GRID <- seq(0.3, 6, by = 0.05)

metric_frame <- function(metric) {
  rows <- lapply(recs, function(r) {
    if (metric == "pts") { q <- r$q_pts; b <- r$banked_pts; re <- r$real_pts }
    else if (metric == "tds") { q <- r$q_tds; b <- r$banked_tds; re <- r$real_tds }
    else if (metric == "tgt") { if (!("targets" %in% r$yard_cols)) return(NULL); q <- r$q_yds[["targets"]]; b <- r$banked_yds[["targets"]]; re <- r$real_yds[["targets"]] }
    else { k <- r$yard_cols[1]; q <- r$q_yds[[k]]; b <- r$banked_yds[[k]]; re <- r$real_yds[[k]] }
    data.frame(pos = r$pos, season = r$season, week = r$week, games_left = r$games_left, banked = b, real = re,
               med = q[50], q10 = q[10], q90 = q[90], plain10 = q[10], plain90 = q[90])
  })
  do.call(rbind, rows)
}

bounds <- function(x, k_lo, k_hi) {
  # TD counts are small and discrete: keep at least one TD of width so the stretch can act.
  lo_w <- pmax(x$med - x$q10, 0); hi_w <- pmax(x$q90 - x$med, 0)
  list(floor = round(x$banked + x$med - k_lo * lo_w), ceiling = round(x$banked + x$med + k_hi * hi_w))
}
fit_k <- function(x, tail) {
  rates <- sapply(K_GRID, function(k) {
    b <- if (tail == "lo") bounds(x, k, 1)$floor else bounds(x, 1, k)$ceiling
    if (tail == "lo") mean(x$real <= b) else mean(x$real >= b)
  })
  K_GRID[which.min(abs(rates - TARGET) + 1e-6 * K_GRID)]
}

out <- list()
for (metric in c("pts", "yds", "tgt", "tds")) {
  df <- metric_frame(metric)
  for (pos in unique(df$pos)) for (w in sort(unique(df$week))) {
    x <- df[df$pos == pos & df$week == w, ]
    k_lo <- fit_k(x, "lo"); k_hi <- fit_k(x, "hi")
    # leave-one-season-out hit rates
    lo_hit <- hi_hit <- n <- 0
    for (Y in SEASONS) {
      tr <- x[x$season != Y, ]; te <- x[x$season == Y, ]
      b <- bounds(te, fit_k(tr, "lo"), fit_k(tr, "hi"))
      lo_hit <- lo_hit + sum(te$real <= b$floor); hi_hit <- hi_hit + sum(te$real >= bounds(te, fit_k(tr, "lo"), fit_k(tr, "hi"))$ceiling); n <- n + nrow(te)
    }
    b <- bounds(x, k_lo, k_hi)
    out[[length(out) + 1]] <- data.frame(
      metric = metric, pos = pos, week = w, games_left = round(mean(x$games_left), 1), n = nrow(x), k_lo = k_lo, k_hi = k_hi,
      plain_below = round(100 * mean(x$real <= x$banked + x$plain10), 1), plain_above = round(100 * mean(x$real >= x$banked + x$plain90), 1),
      oos_below = round(100 * lo_hit / n, 1), oos_above = round(100 * hi_hit / n, 1),
      width_vs_med = round(mean((b$ceiling - b$floor) / pmax(x$banked + x$med, 1)), 3)
    )
  }
}
res <- do.call(rbind, out)
write.csv(res, "banked_calibration_table.csv", row.names = FALSE)
for (m in unique(res$metric)) {
  cat("\n=====", m, "=====\n")
  print(res[res$metric == m, c("pos", "week", "games_left", "k_lo", "k_hi", "plain_below", "plain_above", "oos_below", "oos_above", "width_vs_med")], row.names = FALSE)
}
