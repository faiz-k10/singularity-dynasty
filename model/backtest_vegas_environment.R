# Does Vegas game environment (a team's implied points + expected margin)
# add anything the projection doesn't already know? Motivated by the 2026
# Week 2 post-mortem: player misses correlated ~0.3 with how far the game's
# total beat Vegas' total, and nothing in the current projection reacts to
# game environment (matchup_mult is off, no Vegas input).
#
# Same harness as backtest_vs_sleeper.R -- core recency-weighted median
# (QB via the pass/rush split), 2024-2025 weeks 3-17, scored against real
# outcomes, alongside Sleeper's own historical projections -- plus a
# per-position multiplicative environment adjustment:
#
#   adj_pred = pred * (1 + k1*z + k2*s)
#   z = team implied points this game / that team's average implied points
#       over its previous 8 games - 1   (is THIS game a better/worse
#       scoring environment than the history the projection is built on?)
#   s = team's expected margin (spread, favorite positive) / 10
#
# k's are fit on ONE season and scored on the OTHER (2024->2025, 2025->2024),
# so every adjusted prediction is genuinely out-of-sample. Two questions:
#   (1) does the adjustment beat the plain core model?
#   (2) does it still help once blended with Sleeper (who already prices
#       Vegas in), i.e. on top of the shipped production blend?
#
# Run: Rscript backtest_vegas_environment.R

suppressMessages(library(nflreadr)); suppressMessages(library(jsonlite)); suppressMessages(library(httr))

EXCLUDE_WEEKS <- c(18); TEST_SEASONS <- c(2024, 2025); TEST_WEEKS <- 3:17; LOOKBACK_YEARS <- 3
MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
PASS_PTS_DECAY_QB <- 0.79; RUSH_PTS_DECAY_QB <- 0.88; N_SIMS <- 3000; set.seed(42)
recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_quantile <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]; cw <- (cumsum(w) - 0.5 * w) / sum(w)
  as.numeric(approx(cw, x, q, rule = 2)$y)
}
normalize_join_name <- function(n) tolower(gsub("\\s+(jr|sr|ii|iii|iv|v)$", "", gsub("\\.", "", n), ignore.case = TRUE))

# ---- player history ----
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
reg <- raw[raw$season_type == "REG" & raw$position %in% c("QB","RB","WR","TE") & !(raw$week %in% EXCLUDE_WEEKS) & !is.na(raw$fantasy_points_ppr),
           c("player_display_name","position","team","season","week","fantasy_points_ppr","passing_yards","passing_tds","passing_interceptions","rushing_yards","rushing_tds")]
for (col in c("passing_yards","passing_tds","passing_interceptions","rushing_yards","rushing_tds")) reg[[col]][is.na(reg[[col]])] <- 0
reg$pass_pts <- 0.04*reg$passing_yards + 4*reg$passing_tds - 2*reg$passing_interceptions
reg$rush_pts <- 0.1*reg$rushing_yards + 6*reg$rushing_tds
reg <- reg[order(reg$player_display_name, reg$season, reg$week), ]

# ---- Vegas: per team-game implied points + expected margin ----
sch <- as.data.frame(load_schedules(seasons = all_seasons)); sch <- sch[sch$game_type == "REG" & !is.na(sch$total_line) & !is.na(sch$spread_line), ]
tg <- rbind(
  data.frame(team = sch$home_team, season = sch$season, week = sch$week, implied = sch$total_line/2 + sch$spread_line/2, margin = sch$spread_line),
  data.frame(team = sch$away_team, season = sch$season, week = sch$week, implied = sch$total_line/2 - sch$spread_line/2, margin = -sch$spread_line))
tg <- tg[order(tg$team, tg$season, tg$week), ]
tg$hist_implied <- ave(tg$implied, tg$team, FUN = function(x) { # mean of the previous up-to-8 games, shifted
  sapply(seq_along(x), function(i) if (i == 1) NA else mean(x[max(1, i - 8):(i - 1)])) })
tg$z <- tg$implied / tg$hist_implied - 1
tg$s <- tg$margin / 10
tg$key <- paste(tg$team, tg$season, tg$week)

fetch_sleeper_week <- function(season, week) {
  params <- paste(sapply(c("QB","RB","WR","TE"), function(p) paste0("position[]=", p)), collapse = "&")
  res <- tryCatch(httr::GET(sprintf("https://api.sleeper.app/projections/nfl/%d/%d?season_type=regular&%s", season, week, params), httr::timeout(20)), error = function(e) NULL)
  if (is.null(res) || httr::status_code(res) != 200) return(NULL)
  data <- tryCatch(jsonlite::fromJSON(httr::content(res, "text", encoding = "UTF-8"), simplifyDataFrame = FALSE), error = function(e) NULL)
  if (is.null(data) || !length(data)) return(NULL)
  out <- lapply(data, function(e) if (is.null(e$player) || is.null(e$stats$pts_ppr)) NULL else list(name = paste(e$player$first_name, e$player$last_name), p = e$stats$pts_ppr))
  out <- out[!sapply(out, is.null)]
  setNames(sapply(out, `[[`, "p"), normalize_join_name(sapply(out, `[[`, "name")))
}

rows <- list()
for (season in TEST_SEASONS) for (week in TEST_WEEKS) {
  sl <- fetch_sleeper_week(season, week); if (is.null(sl)) { cat("skip", season, week, "\n"); next }
  wa <- reg[reg$season == season & reg$week == week, ]
  for (r in seq_len(nrow(wa))) {
    p <- wa$player_display_name[r]; pos <- wa$position[r]
    hist <- reg[reg$player_display_name == p & (reg$season < season | (reg$season == season & reg$week < week)) & reg$season >= season - LOOKBACK_YEARS, ]
    n <- nrow(hist); if (n < 8) next
    sk <- normalize_join_name(p); if (!(sk %in% names(sl))) next
    tgr <- tg[match(paste(wa$team[r], season, week), tg$key), ]; if (is.na(tgr$z)) next
    pred <- if (pos == "QB") as.numeric(quantile(sample(hist$pass_pts, N_SIMS, TRUE, recency_weights(n, PASS_PTS_DECAY_QB)) + sample(hist$rush_pts, N_SIMS, TRUE, recency_weights(n, RUSH_PTS_DECAY_QB)), 0.5))
            else weighted_quantile(hist$fantasy_points_ppr, recency_weights(n, MED_DECAY[[pos]]), 0.5)
    rows[[length(rows) + 1]] <- data.frame(season, week, pos, actual = wa$fantasy_points_ppr[r], pred, sleeper = sl[[sk]], z = tgr$z, s = tgr$s)
  }
  cat("done", season, week, " n =", length(rows), "\n"); flush(stdout())
}
d <- do.call(rbind, rows); saveRDS(d, "backtest_vegas_environment_rows.rds")

# ---- fit k's on the other season, score out-of-sample ----
d$adj <- NA; d$adj_z <- NA
for (pos in c("QB","RB","WR","TE")) for (test in TEST_SEASONS) {
  tr <- d[d$pos == pos & d$season != test, ]; idx <- d$pos == pos & d$season == test
  fit <- lm(I(actual - pred) ~ 0 + I(pred*z) + I(pred*s), data = tr)
  fz <- lm(I(actual - pred) ~ 0 + I(pred*z), data = tr)
  d$adj[idx] <- d$pred[idx] * (1 + coef(fit)[1]*d$z[idx] + coef(fit)[2]*d$s[idx])
  d$adj_z[idx] <- d$pred[idx] * (1 + coef(fz)[1]*d$z[idx])
  cat(sprintf("%s fit on non-%d: k_z=%.3f k_spread=%.3f (z-only k=%.3f)\n", pos, test, coef(fit)[1], coef(fit)[2], coef(fz)[1]))
}
mae <- function(x, a) mean(abs(a - x)); rmse <- function(x, a) sqrt(mean((a - x)^2))
cat(sprintf("\nn = %d player-weeks (%s)\n", nrow(d), paste(TEST_SEASONS, collapse = "+")))
cat("corr(residual of core model, z) =", round(cor(d$actual - d$pred, d$z), 3), " | corr(residual, spread) =", round(cor(d$actual - d$pred, d$s), 3), "\n")
cat("corr(residual of SLEEPER, z)    =", round(cor(d$actual - d$sleeper, d$z), 3), " | corr(residual, spread) =", round(cor(d$actual - d$sleeper, d$s), 3), "\n\n")
d$blend <- 0.5*d$pred + 0.5*d$sleeper; d$blend_adj <- 0.5*d$adj + 0.5*d$sleeper
cat(sprintf("%-8s %5s | %s\n", "", "n", "MAE: core / core+vegas(z) / core+vegas(z+spread) / sleeper | 50-50 blend / blend w. adjusted core"))
show <- function(l, x) cat(sprintf("%-8s %5d | %.3f / %.3f / %.3f / %.3f | %.3f / %.3f\n", l, nrow(x), mae(x$pred,x$actual), mae(x$adj_z,x$actual), mae(x$adj,x$actual), mae(x$sleeper,x$actual), mae(x$blend,x$actual), mae(x$blend_adj,x$actual)))
show("ALL", d); for (p in c("QB","RB","WR","TE")) show(p, d[d$pos == p, ])
cat("\nRMSE: core", round(rmse(d$pred,d$actual),3), "| +vegas", round(rmse(d$adj,d$actual),3), "| sleeper", round(rmse(d$sleeper,d$actual),3), "| blend", round(rmse(d$blend,d$actual),3), "| blend+vegas", round(rmse(d$blend_adj,d$actual),3), "\n")
for (t in TEST_SEASONS) { x <- d[d$season == t, ]; cat(sprintf("season %d only (out-of-sample): core %.3f -> +vegas %.3f | blend %.3f -> blend+vegas %.3f\n", t, mae(x$pred,x$actual), mae(x$adj,x$actual), mae(x$blend,x$actual), mae(x$blend_adj,x$actual))) }
hi <- d[d$z >= 0.15, ]; lo <- d[d$z <= -0.15, ]
cat(sprintf("\nExtreme environments: z>=+15%% n=%d mean resid core %+.2f vs +vegas %+.2f | z<=-15%% n=%d core %+.2f vs +vegas %+.2f\n", nrow(hi), mean(hi$actual-hi$pred), mean(hi$actual-hi$adj), nrow(lo), mean(lo$actual-lo$pred), mean(lo$actual-lo$adj)))
