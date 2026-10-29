# Dynasty production value: a 1-10 score per player from his recency-weighted actual PPR points per game,
# rated against HIS OWN position (every position has its own 1-10 scale).
#
#   Rscript dynasty_production_value.R        # writes dynasty_production_anchors.csv + dynasty_production_value.csv
#
#   source("dynasty_production_value.R"); production_value("RB", c(12, 18))     # uses the saved anchors
#
# Why actual PPG and not xFP: backtest_production_blend.R (2012-25, leave-one-season-out) -- actual PPG predicts next
# season's PPG as well as or better than xFP or any mix (best mix gains <= 0.9%).
#
# Method
#   1. A player's number = PPR points per game over his last WINDOW regular-season games (across seasons),
#      weighted by recency with half-life HALF_LIFE games (the same weighting `usage_profile.R` and the backtest use).
#   2. The REFERENCE POOL = that number as of the end of every season 2012-2025 for every player with a real
#      season (>= MIN_GAMES) at the position: what "fantasy-relevant" has looked like, per position.
#   3. production_value = a straight line in weighted PPG between two anchors of his position's reference pool:
#      1 = the pool's LO_PCT percentile, 10 = its HI_PCT percentile (clipped to 1-10), like the age scale. A line
#      (not a percentile rank) so the gaps stay: a percentile bunches the top (an RB at 25 PPG and one at 18 both
#      sit above the 97th). Anchors (saved with the pool's quantiles) are fixed so a later run can't quietly move
#      the scale; re-fit on purpose, not weekly. `pct` (his percentile in the pool) is saved beside the score.
#   4. Current players are scored as of the latest week available; one with fewer than MIN_WINDOW games in his
#      window (a young rookie) is scored but flagged `thin = TRUE`.

suppressMessages(library(nflreadr))

REF_SEASONS <- 2012:2025
POSITIONS   <- c("QB", "RB", "WR", "TE")
MIN_GAMES   <- 8      # a real season, for the reference pool
WINDOW      <- 17
HALF_LIFE   <- 8
LO_PCT      <- 5      # score 1
HI_PCT      <- 99     # score 10
MIN_WINDOW  <- 6      # fewer than this many games in the window -> `thin`

load_games <- function(seasons) {
  ps <- as.data.frame(load_player_stats(seasons))
  ps <- ps[ps$season_type == "REG" & ps$position %in% POSITIONS & !is.na(ps$fantasy_points_ppr), ]
  ps <- ps[order(ps$player_id, ps$season, ps$week), ]
  ps
}
wppg <- function(pts) {                       # pts oldest -> newest, already the last WINDOW games
  w <- 0.5^((rev(seq_along(pts)) - 1) / HALF_LIFE)
  sum(w * pts) / sum(w)
}

# ---- reference pool: as of the end of each season ----
cat("Loading", min(REF_SEASONS), "-", max(REF_SEASONS), "...\n")
g <- load_games(REF_SEASONS)
sea <- aggregate(fantasy_points_ppr ~ player_id + season + position, g, length)
names(sea)[4] <- "n"
sea <- sea[sea$n >= MIN_GAMES, ]
bp <- split(g, g$player_id)
ref <- do.call(rbind, lapply(seq_len(nrow(sea)), function(i) {
  d <- bp[[sea$player_id[i]]]; d <- tail(d[d$season <= sea$season[i], ], WINDOW)
  data.frame(position = sea$position[i], season = sea$season[i], ppg = wppg(d$fantasy_points_ppr))
}))
cat("reference seasons:", nrow(ref), "\n")
write.csv(ref, "dynasty_production_reference.csv", row.names = FALSE)   # read by dynasty_value.R (replacement levels)

# ---- anchors: quantiles 0..100 per position ----
anch <- do.call(rbind, lapply(POSITIONS, function(p) {
  x <- ref$ppg[ref$position == p]
  data.frame(position = p, pct = 0:100, ppg = as.numeric(quantile(x, (0:100) / 100)), n = length(x))
}))
write.csv(anch, "dynasty_production_anchors.csv", row.names = FALSE)

pool_pct <- function(position, ppg, anchors = anch) mapply(function(p, v) {
  a <- anchors[anchors$position == p, ]
  round(approx(a$ppg, a$pct, xout = v, ties = mean, rule = 2)$y, 1)      # outside the pool: nearest end
}, position, ppg, USE.NAMES = FALSE)
production_value <- function(position, ppg, anchors = anch) mapply(function(p, v) {
  a <- anchors[anchors$position == p, ]
  lo <- a$ppg[a$pct == LO_PCT]; hi <- a$ppg[a$pct == HI_PCT]
  round(min(10, max(1, 1 + 9 * (v - lo) / (hi - lo))), 1)
}, position, ppg, USE.NAMES = FALSE)

# ---- current players ----
latest <- as.integer(format(Sys.Date(), "%Y")); cur <- NULL
for (yr in latest:(latest - 1)) { cur <- try(load_games((yr - 1):yr), silent = TRUE); if (!inherits(cur, "try-error") && nrow(cur) > 0) break }
cat("current data through season", max(cur$season), "week", max(cur$week[cur$season == max(cur$season)]), "\n")
names_ <- cur[!duplicated(cur$player_id, fromLast = TRUE), c("player_id", "player_display_name", "position", "team")]
bp2 <- split(cur, cur$player_id)
last_season <- max(cur$season)
out <- do.call(rbind, lapply(names(bp2), function(id) {
  d <- tail(bp2[[id]], WINDOW)
  if (max(d$season) < last_season) return(NULL)                    # not playing this season
  data.frame(player_id = id, games_in_window = nrow(d), ppg_weighted = wppg(d$fantasy_points_ppr))
}))
out <- merge(out, names_, by = "player_id")
out$production_value <- production_value(out$position, out$ppg_weighted)
out$pct <- pool_pct(out$position, out$ppg_weighted)
out$thin <- out$games_in_window < MIN_WINDOW
out$ppg_weighted <- round(out$ppg_weighted, 2)
out <- out[order(out$position, -out$production_value, -out$ppg_weighted),
           c("player_id", "player_display_name", "position", "team", "games_in_window", "ppg_weighted", "production_value", "pct", "thin")]
names(out)[2] <- "player"
write.csv(out, "dynasty_production_value.csv", row.names = FALSE)

cat("\nweighted PPG needed for each score:\n")
sc <- c(1, 3, 5, 7, 8, 9, 10)
bands <- sapply(POSITIONS, function(p) { a <- anch[anch$position == p, ]; lo <- a$ppg[a$pct == LO_PCT]; hi <- a$ppg[a$pct == HI_PCT]
  round(lo + (sc - 1) / 9 * (hi - lo), 1) })
rownames(bands) <- paste("score", sc); print(bands)
for (p in POSITIONS) { cat("\n", p, " top 8 now\n", sep = ""); print(head(out[out$position == p, c("player", "team", "games_in_window", "ppg_weighted", "production_value", "pct")], 8), row.names = FALSE) }
