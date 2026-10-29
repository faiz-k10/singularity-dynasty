# The mechanism the engine would use for rookies: K "prior games" -- real first-season games of past rookies at the same position x
# pick bucket, spread across that cell's distribution -- placed as the OLDEST history, then the live weekly method as is
# (recency-weighted quantiles: median MED_DECAY, floor FLOOR_Q, ceiling CEIL_Q / CEIL_DECAY). Same rookie games and leave-one-season-out
# as backtest_rookie_projection.R. K = 0 is "no prior" (only possible from MIN_GAMES = 6 on, today's rule).
#   Rscript backtest_rookie_prior_games.R
suppressMessages(library(nflreadr))
POS <- c("QB", "RB", "WR", "TE")
MED_DECAY  <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
CEIL_DECAY <- c(RB = 0.89, QB = 0.98, WR = 0.93, TE = 0.91)
CEIL_Q     <- c(RB = 0.94, QB = 0.92, WR = 0.93, TE = 0.945)      # Oct 20 2026 (10% exceed)
FLOOR_Q    <- c(RB = 0.09, QB = 0.08, WR = 0.12, TE = 0.13)
BUCKETS <- c(0, 15, 40, 75, 150, 1000); BLAB <- c("1-15", "16-40", "41-75", "76-150", "151+")
K_GRID <- c(0, 2, 3, 4, 6, 8, 10, 12)

rw <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
wq <- function(x, w, q) { o <- order(x); x <- x[o]; w <- w[o]; cw <- cumsum(w) / sum(w); k <- which(cw >= q)[1]
  if (k == 1) return(x[1]); x[k - 1] + ((q - cw[k - 1]) / (cw[k] - cw[k - 1])) * (x[k] - x[k - 1]) }
interleave <- function(v) { o <- integer(0); i <- 1; j <- length(v); while (i <= j) { o <- c(o, i); if (i != j) o <- c(o, j); i <- i + 1; j <- j - 1 }; v[o] }

ps <- as.data.frame(load_player_stats(2015:2025))
ps <- ps[ps$season_type == "REG" & ps$position %in% POS & ps$week != 18 & !is.na(ps$fantasy_points_ppr), c("player_id", "position", "season", "week", "fantasy_points_ppr")]
dp <- as.data.frame(load_draft_picks()); dp <- dp[!is.na(dp$gsis_id), c("gsis_id", "season", "pick")]; names(dp) <- c("player_id", "draft_year", "pick")
d <- merge(ps, dp, by = "player_id"); d <- d[d$season == d$draft_year, ]; d$bucket <- cut(d$pick, BUCKETS, labels = BLAB); d <- d[order(d$player_id, d$week), ]

rows <- list()
for (pid in unique(d$player_id)) { g <- d[d$player_id == pid, ]
  for (k in seq_len(nrow(g))) rows[[length(rows) + 1]] <- list(season = g$season[k], pos = g$position[k], bucket = as.character(g$bucket[k]), y = g$fantasy_points_ppr[k], h = g$fantasy_points_ppr[seq_len(k - 1)]) }
n_rows <- length(rows); seasons <- vapply(rows, `[[`, 0, "season"); cell <- vapply(rows, function(r) paste(r$pos, r$bucket), "")
ys <- vapply(rows, `[[`, 0, "y"); nn <- vapply(rows, function(r) length(r$h), 0L); posv <- vapply(rows, `[[`, "", "pos")
cat("rookie games:", n_rows, "\n")

res <- list()
for (K in K_GRID) {
  med <- fl <- ce <- rep(NA_real_, n_rows)
  for (s in unique(seasons)) {
    te <- which(seasons == s); tr <- seasons != s
    lib <- split(ys[tr], cell[tr])
    for (i in te) {
      n <- nn[i]; p <- posv[i]
      if (K == 0 && n < 6) next
      prior <- if (K > 0) interleave(as.numeric(quantile(lib[[cell[i]]], (seq_len(K) - 0.5) / K))) else numeric(0)
      h <- c(prior, rows[[i]]$h); m <- length(h)
      med[i] <- wq(h, rw(m, MED_DECAY[p]), 0.5); fl[i] <- wq(h, rw(m, MED_DECAY[p]), FLOOR_Q[p]); ce[i] <- wq(h, rw(m, CEIL_DECAY[p]), CEIL_Q[p])
    }
  }
  res[[as.character(K)]] <- data.frame(K = K, n = nn, pos = posv, y = ys, med = med, fl = fl, ce = ce)
}
R <- do.call(rbind, res); R$grp <- cut(R$n, c(-1, 0, 2, 5, 9, 100), labels = c("0", "1-2", "3-5", "6-9", "10+"))
sm <- function(x) c(rows = sum(!is.na(x$med)), mae = mean(abs(x$y - x$med), na.rm = TRUE), bias = mean(x$y - x$med, na.rm = TRUE),
                    below_floor = 100 * mean(x$y < x$fl, na.rm = TRUE), above_ceiling = 100 * mean(x$y > x$ce, na.rm = TRUE))
for (g in c("1-2", "3-5", "6-9", "10+")) { cat("\n== games before:", g, "  (K = 0 only exists from 6 games)\n"); x <- R[R$grp == g, ]
  print(round(t(sapply(split(x, x$K), sm)), 2)) }
cat("\nBy position at 1-5 games and 6+ games, MAE / bias / below floor % / above ceiling %\n")
for (p in POS) for (g in list(c("1-2", "3-5"), c("6-9", "10+"))) { x <- R[R$pos == p & R$grp %in% g, ]; cat("\n", p, paste(g, collapse = "+"), "\n"); print(round(t(sapply(split(x, x$K), sm)), 2)) }
saveRDS(R, "backtest_rookie_prior_games_rows.rds")
