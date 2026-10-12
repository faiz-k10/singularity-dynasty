# Step 2 of the banked-totals calibration: reads backtest_banked_<season>.rds
# (from backtest_banked_calibration.R) and fits the floor/ceiling stretch used by
# projection_engine.R when BANK_SEASON_TOTALS is on. A ONE-TIME calibration: the
# table it writes (banked_k_table.R) covers every point in the season, so nothing
# here is rerun weekly. Rerun only if the model or its history changes materially.
#
# Definition. For each stat (and the fantasy-points total), per position:
#   median  = banked + the median of the simulation in which he plays EVERY remaining game
#             (f_median; Oct 2026 -- was the all-runs median, injury history included -- so
#             nothing assumes he misses games he has not missed yet)
#   floor   = banked + max(0, f_median - k_lo * (h_median - h_q10))
#   ceiling = banked + f_median + k_hi * (h_q90 - h_median)
# where h_* are quantiles of the SAME simulation restricted to runs where the player
# stays on the field (plays >= 75% of his team's remaining games). So the floor and
# ceiling are a distance from the published median, with the shape of a healthy
# player's range: they cannot cross the median, and the page never shows a floor that
# prices in a lost season. A player who actually misses games is handled the normal
# way -- those games are banked and the next weekly run lowers his numbers.
#
# k_lo / k_hi are fitted per position, stat and as-of week so that, among players who
# really did stay on the field, about 10% land at or below the floor and 10% at or
# above the ceiling. Hits are scored out of sample (leave-one-season-out).
#
# Run: Rscript analyze_banked_calibration.R
#   writes banked_k_table.R (the table the engine sources) and banked_calibration_report.csv
SEASONS <- 2022:2025
recs <- do.call(c, lapply(SEASONS, function(Y) readRDS(sprintf("backtest_banked_%d.rds", Y))))
TARGET <- 0.10
K_GRID <- seq(0.3, 6, by = 0.05)
COUNT_STATS <- c("passing_tds", "passing_interceptions", "rushing_tds", "receiving_tds")
HEALTHY_SHARE <- 0.75

stat_frame <- function(stat, pos) {
  rows <- lapply(recs, function(r) {
    if (r$pos != pos || is.null(r$q[[stat]]) || any(is.na(r$q_h[[stat]]))) return(NULL)
    q <- r$q[[stat]]; h <- r$q_h[[stat]]
    data.frame(season = r$season, week = r$week, games_left = r$games_left, banked = r$banked[[stat]], real = r$real[[stat]],
               med = q[50], f_med = r$q_full[[stat]][50], h_med = h[50], h_q10 = h[10], h_q90 = h[90],
               stayed = (r$real_games - r$games_banked) >= HEALTHY_SHARE * r$games_left)
  })
  do.call(rbind, rows)
}
min_spread <- function(stat) if (stat %in% COUNT_STATS) 1 else 0   # a count stat's quantiles are whole numbers
bounds <- function(x, stat, k_lo, k_hi) {
  lo_w <- pmax(x$h_med - x$h_q10, min_spread(stat)); hi_w <- pmax(x$h_q90 - x$h_med, min_spread(stat))
  med <- round(x$banked + x$f_med)
  floor <- pmin(round(x$banked + pmax(x$f_med - k_lo * lo_w, 0)), med)
  ceiling <- pmax(round(x$banked + x$f_med + k_hi * hi_w), med)
  list(floor = floor, median = med, ceiling = ceiling)
}
fit_k <- function(x, stat, tail) {
  r <- sapply(K_GRID, function(k) { b <- if (tail == "lo") bounds(x, stat, k, 1)$floor else bounds(x, stat, 1, k)$ceiling
                                     if (tail == "lo") mean(x$real <= b) else mean(x$real >= b) })
  K_GRID[which.min(abs(r - TARGET) + 1e-6 * K_GRID)]
}

report <- list()
for (pos in c("QB", "RB", "WR", "TE")) {
  stats <- unique(unlist(lapply(recs[sapply(recs, function(r) r$pos == pos)][1], function(r) names(r$q))))
  for (stat in stats) {
    df <- stat_frame(stat, pos)
    for (w in sort(unique(df$week))) {
      x <- df[df$week == w, ]; h <- x[x$stayed, ]
      k_lo <- fit_k(h, stat, "lo"); k_hi <- fit_k(h, stat, "hi")
      lo_hit <- hi_hit <- n <- 0
      for (Y in SEASONS) {
        tr <- h[h$season != Y, ]; te <- h[h$season == Y, ]
        kl <- fit_k(tr, stat, "lo"); kh <- fit_k(tr, stat, "hi"); b <- bounds(te, stat, kl, kh)
        lo_hit <- lo_hit + sum(te$real <= b$floor); hi_hit <- hi_hit + sum(te$real >= b$ceiling); n <- n + nrow(te)
      }
      ba <- bounds(x, stat, k_lo, k_hi)
      report[[length(report) + 1]] <- data.frame(
        pos = pos, stat = stat, week = w, games_left = round(mean(x$games_left), 2), n = nrow(x), n_stayed = nrow(h),
        k_lo = k_lo, k_hi = k_hi,
        oos_below_stayed = round(100 * lo_hit / n, 1), oos_above_stayed = round(100 * hi_hit / n, 1),
        below_everyone = round(100 * mean(x$real <= ba$floor), 1), above_everyone = round(100 * mean(x$real >= ba$ceiling), 1),
        real_above_median_stayed = round(100 * mean(h$real > ba$median[x$stayed]), 1),
        order_violations = sum(ba$floor > ba$median | ba$ceiling < ba$median))
    }
  }
}
res <- do.call(rbind, report)

# Light smoothing of k across neighbouring as-of weeks (fits are noisy at ~300 players per cell).
smooth3 <- function(v) { n <- length(v); if (n < 3) return(v); s <- v; for (i in 2:(n - 1)) s[i] <- 0.25 * v[i - 1] + 0.5 * v[i] + 0.25 * v[i + 1]; s }
res <- res[order(res$pos, res$stat, res$week), ]
for (key in unique(paste(res$pos, res$stat))) { i <- paste(res$pos, res$stat) == key
  res$k_lo_smooth[i] <- round(smooth3(res$k_lo[i]), 2); res$k_hi_smooth[i] <- round(smooth3(res$k_hi[i]), 2) }
write.csv(res, "banked_calibration_report.csv", row.names = FALSE)

# The engine's table: games_left -> k, per position and stat (interpolated there).
lines <- c("# GENERATED by analyze_banked_calibration.R -- do not edit by hand.",
           "# Floor/ceiling stretch for the banked-totals mode: one row per position, stat and as-of week;",
           "# the engine interpolates k_lo / k_hi on games_left. See that script for what they mean.",
           "BANKED_K <- data.frame(",
           "  pos = c(", paste0("    ", paste(sprintf('"%s"', res$pos), collapse = ", ")), "  ),",
           "  stat = c(", paste0("    ", paste(sprintf('"%s"', res$stat), collapse = ", ")), "  ),",
           "  games_left = c(", paste0("    ", paste(res$games_left, collapse = ", ")), "  ),",
           "  k_lo = c(", paste0("    ", paste(res$k_lo_smooth, collapse = ", ")), "  ),",
           "  k_hi = c(", paste0("    ", paste(res$k_hi_smooth, collapse = ", ")), "  ),",
           "  stringsAsFactors = FALSE",
           ")")
writeLines(lines, "banked_k_table.R")

cat("Out-of-sample hit rates among players who stayed on the field (target 10% each):\n")
print(aggregate(cbind(oos_below_stayed, oos_above_stayed, below_everyone, above_everyone) ~ stat + pos, res, mean), digits = 3)
cat("\nRows where floor > median or ceiling < median (must be 0):", sum(res$order_violations), "\n")
