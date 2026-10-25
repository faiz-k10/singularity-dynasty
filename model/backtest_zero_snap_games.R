# Do games a player was ON THE FIELD for but has no stat line in (nflverse weekly stats only carry players with a recorded stat; e.g. Cam
# Skattebo, 2026 week 6: benched after a fumble, 6 offense snaps, no touches) belong in the recency-weighted history as 0.0 games?
# They are real games a player was active for; load_history() in projection_engine.R never sees them. No snap-share threshold: any
# offense snap with no stat row counts.
#
# Fair test (the README's discipline from the snap-filter studies): the SAME target games either way, only the input history differs.
# Targets = every game of the augmented data (stat rows + zero games), because "he was active and scored 0.0" is a real outcome the
# projection has to predict. Predictor = the plain recency-weighted median at the engine's per-position MED_DECAY (the engine's
# published number adds a Sleeper blend on top; as in the other backtests here this isolates the history question).
# old history = stat rows only; new history = stat rows + zero games.
#
# Run: Rscript backtest_zero_snap_games.R
suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 8
MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
POSITIONS <- c("QB", "RB", "WR", "TE")

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_quantile <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]
  cw <- (cumsum(w) - 0.5 * w) / sum(w)
  as.numeric(approx(cw, x, q, rule = 2)$y)
}

seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
cat("Loading", paste(range(seasons), collapse = "-"), "...\n")
ps <- as.data.frame(load_player_stats(seasons = seasons))
ps <- ps[ps$season_type == "REG" & ps$position %in% POSITIONS & !is.na(ps$fantasy_points_ppr), c("player_id", "position", "season", "week", "fantasy_points_ppr")]
ps$zero <- FALSE

sn <- as.data.frame(load_snap_counts(seasons = seasons))
sn <- sn[sn$game_type == "REG" & sn$position %in% POSITIONS & !is.na(sn$offense_snaps) & sn$offense_snaps > 0, ]
pl <- as.data.frame(load_players()); pl <- pl[!is.na(pl$pfr_id) & !is.na(pl$gsis_id), c("pfr_id", "gsis_id")]; pl <- pl[!duplicated(pl$pfr_id), ]
sn <- merge(sn, pl, by.x = "pfr_player_id", by.y = "pfr_id")
sn <- sn[!(paste(sn$gsis_id, sn$season, sn$week) %in% paste(ps$player_id, ps$season, ps$week)), ]
zero <- data.frame(player_id = sn$gsis_id, position = sn$position, season = sn$season, week = sn$week, fantasy_points_ppr = 0, zero = TRUE)
all <- rbind(ps, zero)
all <- all[!(all$week %in% EXCLUDE_WEEKS), ]
all <- all[order(all$player_id, all$season, all$week), ]
cat(sprintf("%d stat games + %d zero-snap games (%.1f%% of all games)\n\n", sum(!all$zero), sum(all$zero), 100 * mean(all$zero)))

err_old <- err_new <- setNames(vector("list", 4), POSITIONS)
tag <- setNames(vector("list", 4), POSITIONS)   # per target: is it a zero game; did the history end with a zero in the last 3 games
for (id in unique(all$player_id)) {
  d <- all[all$player_id == id, ]
  pos <- d$position[1]; n <- nrow(d)
  if (n < MIN_HIST_GAMES + 1) next
  for (i in (MIN_HIST_GAMES + 1):n) {
    if (!(d$season[i] %in% TEST_SEASONS)) next
    h_new <- d[1:(i - 1), ]
    h_old <- h_new[!h_new$zero, ]
    if (nrow(h_old) < MIN_HIST_GAMES) next
    a <- d$fantasy_points_ppr[i]
    p_old <- weighted_quantile(h_old$fantasy_points_ppr, recency_weights(nrow(h_old), MED_DECAY[[pos]]), 0.5)
    p_new <- weighted_quantile(h_new$fantasy_points_ppr, recency_weights(nrow(h_new), MED_DECAY[[pos]]), 0.5)
    err_old[[pos]] <- c(err_old[[pos]], abs(a - p_old))
    err_new[[pos]] <- c(err_new[[pos]], abs(a - p_new))
    tag[[pos]] <- rbind(tag[[pos]], data.frame(zero_target = d$zero[i], recent_zero = any(tail(h_new$zero, 3))))
  }
}

cat("=== Same target games, history without vs with the zero-snap games (MAE of the weekly median) ===\n")
for (pos in POSITIONS) {
  o <- err_old[[pos]]; nw <- err_new[[pos]]; t <- tag[[pos]]
  cat(sprintf("%s  n=%d  old MAE=%.4f  new MAE=%.4f  change=%+.2f%%\n", pos, length(o), mean(o), mean(nw), 100 * (mean(nw) - mean(o)) / mean(o)))
  for (nm in c("recent_zero", "zero_target")) {
    k <- t[[nm]]
    if (sum(k) > 20) cat(sprintf("     where %-11s (n=%d): old %.4f  new %.4f  change %+.2f%%\n", nm, sum(k), mean(o[k]), mean(nw[k]), 100 * (mean(nw[k]) - mean(o[k])) / mean(o[k])))
  }
}
