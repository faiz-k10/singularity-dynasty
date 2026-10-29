# Which mix of expected points (xFP) and actual points per game best predicts a player's NEXT season?
# The input for a dynasty "production" score.   Rscript backtest_production_blend.R
#
# As of the end of each season t, for every player with a real season (>= MIN_GAMES) in t:
#   - actual PPG and xFP per game over his last WINDOW regular-season games (can reach back into earlier
#     seasons), weighted by recency with half-life HALF_LIFE games -- the same weighting `usage_profile.R` uses
#   - TARGET 1: his PPG in season t+1 (>= MIN_GAMES);  TARGET 2: his mean PPG over t+1 and t+2 (each season he
#     has >= MIN_GAMES in; at least one) -- the "dynasty" version, two years out
# Blend = w * xFP + (1 - w) * PPG, w on a grid. For each position and w a straight line
# (target ~ a + b * blend) is fit on all OTHER seasons and scored on the held-out one (leave-one-season-out),
# so the numbers are out of sample. Everyone is scored on the same rows, so the comparison between blends is fair
# (a player who only qualifies in the target year is a survivor for every blend alike).

suppressMessages(library(nflreadr))

SEASONS   <- 2012:2025
POSITIONS <- c("QB", "RB", "WR", "TE")
MIN_GAMES <- 8
WINDOW    <- 17
HALF_LIFE <- 8
W_GRID    <- seq(0, 1, by = 0.1)

cat("Loading stats + xFP", min(SEASONS), "-", max(SEASONS), "...\n")
ps <- as.data.frame(load_player_stats(SEASONS))
ps <- ps[ps$season_type == "REG" & ps$position %in% POSITIONS & !is.na(ps$fantasy_points_ppr),
         c("player_id", "season", "week", "position", "fantasy_points_ppr")]
xf <- as.data.frame(load_ff_opportunity(SEASONS, stat_type = "weekly"))[, c("player_id", "season", "week", "total_fantasy_points_exp")]
names(xf)[4] <- "xfp"
g <- merge(ps, xf, by = c("player_id", "season", "week"), all.x = TRUE)
g <- g[order(g$player_id, g$season, g$week), ]
cat("games:", nrow(g), "  with xFP:", sum(!is.na(g$xfp)), "\n")

# season table: games, PPG
sea <- aggregate(fantasy_points_ppr ~ player_id + season + position, g, function(x) c(n = length(x), ppg = mean(x)))
sea <- do.call(data.frame, sea); names(sea) <- c("player_id", "season", "position", "n", "ppg")
sea <- sea[sea$n >= MIN_GAMES, ]
sk <- paste(sea$player_id, sea$season)

by_player <- split(g, g$player_id)
rows <- list()
for (i in seq_len(nrow(sea))) {
  p <- sea$player_id[i]; t <- sea$season[i]
  d <- by_player[[p]]; d <- d[d$season <= t, ]
  d <- tail(d, WINDOW)
  age <- rev(seq_len(nrow(d))) - 1                     # 0 = his latest game
  w <- 0.5^(age / HALF_LIFE)
  hx <- !is.na(d$xfp)
  if (sum(hx) < MIN_GAMES) next
  ppg_w <- sum(w[hx] * d$fantasy_points_ppr[hx]) / sum(w[hx])    # actual PPG over the SAME games that have xFP
  xfp_w <- sum(w[hx] * d$xfp[hx]) / sum(w[hx])
  j1 <- match(paste(p, t + 1), sk); j2 <- match(paste(p, t + 2), sk)
  if (is.na(j1)) next                                              # next-season target needs a real season
  y1 <- sea$ppg[j1]
  y2 <- mean(c(y1, if (!is.na(j2)) sea$ppg[j2]))
  rows[[length(rows) + 1]] <- data.frame(position = sea$position[i], season = t, ppg = ppg_w, xfp = xfp_w, y1 = y1, y2 = y2)
}
D <- do.call(rbind, rows)
cat("player-seasons with a following season:", nrow(D), "\n\n")

loso <- function(d, target, w) {
  b <- w * d$xfp + (1 - w) * d$ppg
  pred <- rep(NA_real_, nrow(d))
  for (s in unique(d$season)) {
    tr <- d$season != s
    fit <- lm(d[[target]][tr] ~ b[tr])
    pred[!tr] <- coef(fit)[1] + coef(fit)[2] * b[!tr]
  }
  c(rmse = sqrt(mean((d[[target]] - pred)^2)), r2 = 1 - sum((d[[target]] - pred)^2) / sum((d[[target]] - mean(d[[target]]))^2))
}

res <- list()
for (pos in POSITIONS) for (target in c("y1", "y2")) {
  d <- D[D$position == pos, ]
  m <- t(sapply(W_GRID, function(w) loso(d, target, w)))
  res[[length(res) + 1]] <- data.frame(position = pos, target = target, n = nrow(d), w_xfp = W_GRID, rmse = m[, "rmse"], r2 = m[, "r2"])
}
R <- do.call(rbind, res)

cat("Out-of-sample (leave-one-season-out) RMSE of next-season PPG, by weight on xFP (0 = actual PPG only, 1 = xFP only)\n")
for (target in c("y1", "y2")) {
  cat(sprintf("\n== target: %s ==\n", if (target == "y1") "PPG next season" else "mean PPG, next two seasons"))
  for (pos in POSITIONS) {
    r <- R[R$position == pos & R$target == target, ]
    best <- r[which.min(r$rmse), ]
    cat(sprintf("%s  n=%4d | PPG only %.3f (R2 %.3f) | xFP only %.3f (R2 %.3f) | best w=%.1f %.3f (R2 %.3f) | gain vs PPG only %.1f%%\n",
                pos, best$n, r$rmse[r$w_xfp == 0], r$r2[r$w_xfp == 0], r$rmse[r$w_xfp == 1], r$r2[r$w_xfp == 1],
                best$w_xfp, best$rmse, best$r2, 100 * (1 - best$rmse / r$rmse[r$w_xfp == 0])))
  }
}
cat("\nRMSE by weight (next-season target):\n")
w <- reshape(R[R$target == "y1", c("position", "w_xfp", "rmse")], idvar = "w_xfp", timevar = "position", direction = "wide")
print(w, digits = 3, row.names = FALSE)
saveRDS(R, "backtest_production_blend_results.rds")
