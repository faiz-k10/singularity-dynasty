# How much memory should the production number have? Window (games) x half-life (games), scored the same way as
# backtest_production_blend.R: as of the end of each season, a player's recency-weighted PPG predicts his PPG in the next
# season (y1) and the mean of the next two (y2); a line is fit on the other seasons (leave-one-season-out), RMSE reported.
#   Rscript backtest_production_window.R
suppressMessages(library(nflreadr))
SEASONS <- 2012:2025; POSITIONS <- c("QB", "RB", "WR", "TE"); MIN_GAMES <- 8
WINDOWS <- c(17, 34, 51, 68); HALF_LIVES <- c(4, 8, 17, 34, Inf)
ps <- as.data.frame(load_player_stats(SEASONS))
ps <- ps[ps$season_type == "REG" & ps$position %in% POSITIONS & !is.na(ps$fantasy_points_ppr) & !is.na(ps$player_id), c("player_id", "season", "week", "position", "fantasy_points_ppr")]
ps <- ps[order(ps$player_id, ps$season, ps$week), ]
sea <- aggregate(fantasy_points_ppr ~ player_id + season + position, ps, function(x) c(n = length(x), ppg = mean(x)))
sea <- do.call(data.frame, sea); names(sea) <- c("player_id", "season", "position", "n", "ppg")
sea <- sea[sea$n >= MIN_GAMES, ]; sk <- paste(sea$player_id, sea$season)
bp <- split(ps, ps$player_id)
base <- lapply(seq_len(nrow(sea)), function(i) {
  j1 <- match(paste(sea$player_id[i], sea$season[i] + 1), sk); if (is.na(j1)) return(NULL)
  j2 <- match(paste(sea$player_id[i], sea$season[i] + 2), sk)
  d <- bp[[sea$player_id[i]]]; d <- d[d$season <= sea$season[i], ]
  list(pts = d$fantasy_points_ppr, pos = sea$position[i], season = sea$season[i], y1 = sea$ppg[j1], y2 = mean(c(sea$ppg[j1], if (!is.na(j2)) sea$ppg[j2])))
})
base <- base[!vapply(base, is.null, TRUE)]
cat("player-seasons:", length(base), "\n")
loso <- function(x, y, season) { pred <- rep(NA_real_, length(x)); for (s in unique(season)) { tr <- season != s; f <- lm(y[tr] ~ x[tr]); pred[!tr] <- coef(f)[1] + coef(f)[2] * x[!tr] }; sqrt(mean((y - pred)^2)) }
res <- list()
for (W in WINDOWS) for (H in HALF_LIVES) {
  x <- vapply(base, function(b) { p <- tail(b$pts, W); w <- if (is.infinite(H)) rep(1, length(p)) else 0.5^((rev(seq_along(p)) - 1) / H); sum(w * p) / sum(w) }, 0)
  for (pos in POSITIONS) {
    k <- vapply(base, function(b) b$pos == pos, TRUE); sn <- vapply(base, function(b) b$season, 0)[k]
    res[[length(res) + 1]] <- data.frame(window = W, half_life = H, position = pos, n = sum(k),
      rmse_y1 = loso(x[k], vapply(base, function(b) b$y1, 0)[k], sn), rmse_y2 = loso(x[k], vapply(base, function(b) b$y2, 0)[k], sn))
  }
}
R <- do.call(rbind, res)
cat("\nRMSE of next-season PPG (y1) by window x half-life (17 / 8 is the current setting)\n")
for (pos in POSITIONS) { cat("\n", pos, "\n"); print(round(reshape(R[R$position == pos, c("window", "half_life", "rmse_y1")], idvar = "window", timevar = "half_life", direction = "wide"), 3), row.names = FALSE) }
cat("\nSame, two seasons out (y2)\n")
for (pos in POSITIONS) { cat("\n", pos, "\n"); print(round(reshape(R[R$position == pos, c("window", "half_life", "rmse_y2")], idvar = "window", timevar = "half_life", direction = "wide"), 3), row.names = FALSE) }
cur <- R[R$window == 17 & R$half_life == 8, ]
cat("\nbest per position (y1) vs current:\n")
for (pos in POSITIONS) { r <- R[R$position == pos, ]; b <- r[which.min(r$rmse_y1), ]; c0 <- cur[cur$position == pos, ]
  cat(sprintf("%s best window %d half-life %s: %.3f vs current %.3f (%.1f%% better) | y2 best %.3f vs %.3f\n", pos, b$window, b$half_life, b$rmse_y1, c0$rmse_y1, 100 * (1 - b$rmse_y1 / c0$rmse_y1), min(r$rmse_y2), c0$rmse_y2)) }
saveRDS(R, "backtest_production_window_results.rds")
