# Which defenses are actually moving fantasy scoring this season (good and bad), per position and overall.
#
# Method. For every game, the fantasy points (PPR) one offense scored at one position (QB, RB, WR, TE;
# summed over every player of that position on that team) are modelled as
#     points = league level + offense effect + defense effect + noise
# fitted jointly (a two-way ridge regression), so a defense is NOT blamed for facing a great offense and
# an offense is NOT credited for a soft schedule. Last season's games count at PRIOR_WEIGHT of this
# season's. The ridge penalty shrinks every team toward average, hard enough that four games cannot make
# a defense look extreme by luck; it is chosen per position by walk-forward testing on the previous
# season (predict week w from only what was known before week w) -- the printed validation shows whether
# the defense term earns its place at all.
#
# defense effect = fantasy points per game that defense allows to that position ABOVE an average defense
# (positive = generous / bad, negative = stingy / good). "total" adds QB+RB+WR+TE.
#
# Run: Rscript defense_impact.R          writes defense_impact.csv and prints the summary
suppressMessages(library(nflreadr))

SEASON <- as.integer(Sys.getenv("DI_SEASON", "2026"))
PRIOR_SEASON <- SEASON - 1
PRIOR_WEIGHT <- 0.35
POS <- c("QB", "RB", "WR", "TE")
LAMBDA_O <- c(5, 10, 20)
LAMBDA_D <- c(10, 20, 40, 80, 160, 1e6)   # 1e6 = "no defense effect" (offense-only baseline)

load_games <- function(seasons) {
  s <- as.data.frame(load_player_stats(seasons = seasons))
  s <- s[s$season_type == "REG" & s$position %in% POS & !is.na(s$opponent_team) & !is.na(s$fantasy_points_ppr), ]
  g <- aggregate(fantasy_points_ppr ~ season + week + team + opponent_team + position, data = s, FUN = sum)
  names(g) <- c("season", "week", "off", "def", "pos", "y")
  g
}

teams_of <- function(g) sort(unique(c(g$off, g$def)))

# Ridge fit for one position. Columns: intercept, season indicators (unpenalised), offense dummies, defense dummies.
design <- function(g, teams, seasons) {
  n <- nrow(g)
  o <- matrix(0, n, length(teams)); d <- matrix(0, n, length(teams))
  o[cbind(seq_len(n), match(g$off, teams))] <- 1
  d[cbind(seq_len(n), match(g$def, teams))] <- 1
  sidx <- vapply(seasons[-1], function(s) as.numeric(g$season == s), numeric(n))
  X <- cbind(1, if (length(seasons) > 1) sidx, o, d)
  list(X = X, k0 = 1 + max(0, length(seasons) - 1))
}
fit_ridge <- function(g, w, teams, seasons, lo, ld) {
  dz <- design(g, teams, seasons)
  X <- dz$X; p <- ncol(X); k0 <- dz$k0; nt <- length(teams)
  pen <- c(rep(0, k0), rep(lo, nt), rep(ld, nt))
  XtW <- t(X * w)
  A <- XtW %*% X + diag(pen, p)
  b <- solve(A, XtW %*% g$y)
  r <- g$y - X %*% b
  sigma2 <- sum(w * r^2) / max(sum(w) - sum(diag(XtW %*% X %*% solve(A))), 1)
  list(b = as.vector(b), A = A, k0 = k0, nt = nt, sigma2 = sigma2, teams = teams, seasons = seasons)
}
predict_ridge <- function(f, g) {
  dz <- design(g, f$teams, f$seasons)
  as.vector(dz$X %*% f$b)
}

# ---- walk-forward validation on the previous season ------------------------------------------------------
cat(sprintf("Validating on %d (train: %d at weight %.2f + %d weeks before the one predicted)\n", PRIOR_SEASON, PRIOR_SEASON - 1, PRIOR_WEIGHT, PRIOR_SEASON))
gv <- load_games(c(PRIOR_SEASON - 1, PRIOR_SEASON))
teams_v <- teams_of(gv)
weeks_v <- sort(unique(gv$week[gv$season == PRIOR_SEASON]))
weeks_v <- weeks_v[weeks_v >= 5 & weeks_v <= 17]
cv <- list()
for (pos in POS) {
  gp <- gv[gv$pos == pos, ]
  for (lo in LAMBDA_O) for (ld in LAMBDA_D) {
    se <- numeric(0); early <- logical(0)
    for (wk in weeks_v) {
      tr <- gp[gp$season == PRIOR_SEASON - 1 | (gp$season == PRIOR_SEASON & gp$week < wk), ]
      te <- gp[gp$season == PRIOR_SEASON & gp$week == wk, ]
      w <- ifelse(tr$season == PRIOR_SEASON, 1, PRIOR_WEIGHT)
      f <- fit_ridge(tr, w, teams_v, c(PRIOR_SEASON - 1, PRIOR_SEASON), lo, ld)
      e <- (te$y - predict_ridge(f, te))^2
      se <- c(se, e); early <- c(early, rep(wk <= 8, length(e)))
    }
    cv[[length(cv) + 1]] <- data.frame(pos = pos, lo = lo, ld = ld, rmse = sqrt(mean(se)), rmse_early = sqrt(mean(se[early])))
  }
}
cv <- do.call(rbind, cv)
best <- do.call(rbind, lapply(POS, function(p) { x <- cv[cv$pos == p, ]; x[which.min(x$rmse), ] }))
base <- do.call(rbind, lapply(POS, function(p) { x <- cv[cv$pos == p & cv$ld == 1e6, ]; x[which.min(x$rmse), ] }))
val <- data.frame(pos = POS, lambda_o = best$lo, lambda_d = best$ld,
                  rmse_with_defense = round(best$rmse, 3), rmse_offense_only = round(base$rmse, 3),
                  gain_pct = round(100 * (1 - best$rmse / base$rmse), 2),
                  early_gain_pct = round(100 * (1 - best$rmse_early / base$rmse_early), 2))
cat("\nWalk-forward check (weeks 5-17 of the previous season; 'early' = weeks 5-8). gain = how much closer the\n")
cat("predictions get when defense effects are included vs. an offense-only baseline:\n")
print(val, row.names = FALSE)

# ---- this season's fit ------------------------------------------------------------------------------------
g <- load_games(c(PRIOR_SEASON, SEASON))
teams <- teams_of(g)
latest <- max(g$week[g$season == SEASON])
games_played <- tapply(g$week[g$season == SEASON & g$pos == "QB"], g$def[g$season == SEASON & g$pos == "QB"], length)
out <- data.frame(team = teams, games = as.integer(games_played[teams]))
for (pos in POS) {
  gp <- g[g$pos == pos, ]
  w <- ifelse(gp$season == SEASON, 1, PRIOR_WEIGHT)
  b <- best[best$pos == pos, ]
  f <- fit_ridge(gp, w, teams, c(PRIOR_SEASON, SEASON), b$lo, b$ld)
  nt <- length(teams); idx <- f$k0 + nt + seq_len(nt)
  cov <- f$sigma2 * solve(f$A)   # posterior covariance of the ridge estimate
  d <- f$b[idx]; se <- sqrt(diag(cov)[idx])
  out[[pos]] <- round(d, 2); out[[paste0(pos, "_se")]] <- round(se, 2)
  # raw (unadjusted) points per game allowed vs. league, this season only, for context
  raw <- tapply(gp$y[gp$season == SEASON], gp$def[gp$season == SEASON], mean)
  out[[paste0(pos, "_raw")]] <- round(raw[teams] - mean(gp$y[gp$season == SEASON]), 2)
}
out$total <- round(rowSums(out[, POS]), 2)
out$total_se <- round(sqrt(rowSums(out[, paste0(POS, "_se")]^2)), 2)
out$z <- round(out$total / out$total_se, 2)
out <- out[order(-out$total), ]
write.csv(out, "defense_impact.csv", row.names = FALSE)

cat(sprintf("\n%d season through week %d. Effects are fantasy points per game vs. an average defense (+ = generous).\n", SEASON, latest))
show <- function(x) print(x[, c("team", "games", "QB", "RB", "WR", "TE", "total", "total_se", "z")], row.names = FALSE)
cat("\nMOST GENEROUS (smash spots):\n"); show(head(out, 6))
cat("\nSTINGIEST (avoid spots):\n"); show(tail(out[order(-out$total), ], 6)[6:1, ])
cat("\nLeague spread of the total effect: sd =", round(sd(out$total), 2), "; middle 20 teams within +/-", round(quantile(abs(out$total), 0.6), 2), "\n")
