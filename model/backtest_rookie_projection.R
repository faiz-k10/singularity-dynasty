# Can a rookie be projected from draft capital + his own games, including BEFORE the 6-game floor?
#   Rscript backtest_rookie_projection.R
#
# Unit: every game a ROOKIE (drafted that year; QB / RB / WR / TE) actually played in 2015-2025, week 18 left out like the live
# model. Known before it: the games he already played that season (n of them), his draft pick, his position, the week.
# Methods, scored on the same games (mean absolute error of the median, bias = actual - projection, and for n >= 6 the current
# live method as the benchmark -- recency-weighted median, MED_DECAY, no Sleeper blend):
#   current  recency-weighted median of his own games (only exists from n = MIN_GAMES)
#   prior    expected points for his position and pick bucket alone (the mean of rookie games in the OTHER seasons)
#   blend    (n x his weighted mean + K x prior) / (n + K), K per position fit on the other seasons
#   model    linear: next game ~ his weighted mean + prior + n + week, per position, fit on the other seasons
# Leave-one-season-out everywhere (each season is predicted by a fit that never saw it), so the numbers are out of sample.
suppressMessages(library(nflreadr))

POS <- c("QB", "RB", "WR", "TE")
MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
BUCKETS <- c(0, 15, 40, 75, 150, 1000); BLAB <- c("1-15", "16-40", "41-75", "76-150", "151+/UDFA")
K_GRID <- c(0.5, 1, 2, 3, 4, 6, 8, 12)

rw <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
wq <- function(x, w, q) { o <- order(x); x <- x[o]; w <- w[o]; cw <- cumsum(w) / sum(w); k <- which(cw >= q)[1]
  if (k == 1) return(x[1]); x[k - 1] + ((q - cw[k - 1]) / (cw[k] - cw[k - 1])) * (x[k] - x[k - 1]) }

cat("Loading ...\n")
ps <- as.data.frame(load_player_stats(2015:2025))
ps <- ps[ps$season_type == "REG" & ps$position %in% POS & ps$week != 18 & !is.na(ps$fantasy_points_ppr), c("player_id", "position", "season", "week", "fantasy_points_ppr")]
dp <- as.data.frame(load_draft_picks()); dp <- dp[!is.na(dp$gsis_id), c("gsis_id", "season", "pick")]; names(dp) <- c("player_id", "draft_year", "pick")
d <- merge(ps, dp, by = "player_id"); d <- d[d$season == d$draft_year, ]          # rookie seasons only
d$bucket <- cut(d$pick, BUCKETS, labels = BLAB); d <- d[order(d$player_id, d$week), ]

rows <- list()
for (pid in unique(d$player_id)) {
  g <- d[d$player_id == pid, ]
  for (k in seq_len(nrow(g))) {
    h <- g$fantasy_points_ppr[seq_len(k - 1)]; n <- length(h)
    rows[[length(rows) + 1]] <- data.frame(season = g$season[k], pos = g$position[k], bucket = g$bucket[k], n = n, week = g$week[k],
      y = g$fantasy_points_ppr[k], wmean = if (n) sum(rw(n, MED_DECAY[g$position[k]]) * h) else NA_real_,
      cur = if (n >= 6) wq(h, rw(n, MED_DECAY[g$position[k]]), 0.5) else NA_real_)
  }
}
r <- do.call(rbind, rows)
r$grp <- cut(r$n, c(-1, 0, 2, 5, 9, 100), labels = c("0 games", "1-2", "3-5", "6-9", "10+"))
cat("rookie games:", nrow(r), " seasons", min(r$season), "-", max(r$season), "\n")

# ---- leave-one-season-out predictions ----
r$prior <- r$blend <- r$model <- NA_real_
for (s in unique(r$season)) {
  te <- r$season == s; tr <- !te
  cellmean <- tapply(r$y[tr], list(r$pos[tr], r$bucket[tr]), mean)
  r$prior[te] <- mapply(function(p, b) cellmean[p, b], r$pos[te], as.character(r$bucket[te]))
  for (p in POS) {
    tp <- tr & r$pos == p
    pr_tr <- mapply(function(pp, b) cellmean[pp, b], r$pos[tp], as.character(r$bucket[tp]))
    # K for the blend: whichever minimises the error on the training seasons
    best <- NULL
    for (K in K_GRID) { n <- r$n[tp]; b <- ifelse(n > 0, (n * r$wmean[tp] + K * pr_tr) / (n + K), pr_tr); e <- mean(abs(r$y[tp] - b)); if (is.null(best) || e < best$e) best <- list(K = K, e = e) }
    ip <- te & r$pos == p; n <- r$n[ip]
    r$blend[ip] <- ifelse(n > 0, (n * r$wmean[ip] + best$K * r$prior[ip]) / (n + best$K), r$prior[ip])
    # linear model on games with n >= 1; n = 0 falls back to the prior
    X <- data.frame(y = r$y[tp], wm = r$wmean[tp], pr = pr_tr, n = pmin(r$n[tp], 12), wk = r$week[tp])
    fit <- lm(y ~ wm + pr + n + wk, data = X[!is.na(X$wm), ])
    Z <- data.frame(wm = r$wmean[ip], pr = r$prior[ip], n = pmin(r$n[ip], 12), wk = r$week[ip])
    r$model[ip] <- ifelse(is.na(Z$wm), r$prior[ip], predict(fit, Z))
  }
}

score <- function(x, col) c(mae = mean(abs(x$y - x[[col]])), bias = mean(x$y - x[[col]]))
for (p in c("ALL", POS)) {
  x <- if (p == "ALL") r else r[r$pos == p, ]
  cat("\n==", p, " (MAE / bias = actual - projection, points)\n")
  tab <- do.call(rbind, lapply(levels(x$grp), function(g) { z <- x[x$grp == g, ]; if (!nrow(z)) return(NULL)
    cur <- if (g %in% c("6-9", "10+")) score(z, "cur") else c(NA, NA)
    data.frame(games = g, n = nrow(z), mean_pts = round(mean(z$y), 2), cur_mae = cur[1], cur_bias = cur[2],
      prior_mae = score(z, "prior")[1], prior_bias = score(z, "prior")[2], blend_mae = score(z, "blend")[1], blend_bias = score(z, "blend")[2],
      model_mae = score(z, "model")[1], model_bias = score(z, "model")[2]) }))
  print(round(tab[, -1], 2), row.names = FALSE); cat("   rows:", paste(tab$games, collapse = " | "), "\n")
}
saveRDS(r, "backtest_rookie_projection_rows.rds")
