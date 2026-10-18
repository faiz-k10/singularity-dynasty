# How accurate are WEEKLY projections for rookies once they qualify (6+ games) compared with veterans?
#
# Walk-forward, 2022-2025, next-game: for each player-game, project from only the games before it with the live
# weekly method (recency-weighted quantiles: median at MED_DECAY, floor at FLOOR_Q, ceiling at CEIL_Q / CEIL_DECAY), the
# same 6-game eligibility floor, then score against the real result. Groups:
#   rookie, 6-9 prior games   (first NFL season, just past the eligibility floor -- where a new rookie starts)
#   rookie, 10+ prior games   (later in his first season)
#   veteran, 20+ prior games  (the comparison)
# Reports mean absolute error of the median, bias (actual minus median), and how often the real score lands below the
# floor / above the ceiling. Approximation: the live median also blends 15% weighted mean and Sleeper's projection, which
# this leaves out, so absolute numbers run a little worse than live; the rookie-vs-veteran GAP is the point.
suppressMessages(library(nflreadr))

MED_DECAY  <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
CEIL_DECAY <- c(RB = 0.89, QB = 0.98, WR = 0.93, TE = 0.91)
CEIL_Q     <- c(RB = 0.995, QB = 0.985, WR = 0.975, TE = 0.995)
FLOOR_Q    <- c(RB = 0.09, QB = 0.08, WR = 0.12, TE = 0.13)
MIN_GAMES  <- 6
TEST <- 2022:2025

rw <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
wq <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]; cw <- cumsum(w) / sum(w); k <- which(cw >= q)[1]
  if (k == 1) return(x[1]); x[k - 1] + ((q - cw[k - 1]) / (cw[k] - cw[k - 1])) * (x[k] - x[k - 1])
}

raw <- as.data.frame(load_player_stats(2015:2025))
d <- raw[raw$season_type == "REG" & raw$position %in% names(MED_DECAY) & raw$week != 18 & !is.na(raw$fantasy_points_ppr),
         c("player_id", "position", "season", "week", "fantasy_points_ppr")]
d <- d[order(d$player_id, d$season, d$week), ]
first_season <- tapply(d$season, d$player_id, min)

out <- list()
for (pid in unique(d$player_id)) {
  g <- d[d$player_id == pid, ]
  rook_season <- first_season[[pid]]
  if (rook_season == 2015) rook_season <- NA  # can't tell whether 2015 was really his first season
  pos <- g$position[1]
  for (k in seq_len(nrow(g))) {
    if (!(g$season[k] %in% TEST) || k - 1 < MIN_GAMES) next
    h <- g$fantasy_points_ppr[1:(k - 1)]; n <- length(h)
    rookie <- !is.na(rook_season) && g$season[k] == rook_season
    grp <- if (rookie && n <= 9) "rookie 6-9 games" else if (rookie) "rookie 10+ games" else if (n >= 20) "veteran 20+ games" else NA
    if (is.na(grp)) next
    wm <- rw(n, MED_DECAY[pos]); wc <- rw(n, CEIL_DECAY[pos])
    out[[length(out) + 1]] <- data.frame(grp = grp, pos = pos, actual = g$fantasy_points_ppr[k],
      med = wq(h, wm, 0.5), fl = wq(h, wm, FLOOR_Q[pos]), ce = wq(h, wc, CEIL_Q[pos]))
  }
}
r <- do.call(rbind, out)
summ <- function(x) c(n = nrow(x), mae = mean(abs(x$actual - x$med)), bias = mean(x$actual - x$med),
                      below_floor = 100 * mean(x$actual < x$fl), above_ceiling = 100 * mean(x$actual > x$ce),
                      mean_pts = mean(x$actual))
cat("\nAll positions\n")
print(round(t(sapply(split(r, r$grp), summ)), 2))
for (p in names(MED_DECAY)) {
  cat("\n", p, "\n")
  print(round(t(sapply(split(r[r$pos == p, ], r$grp[r$pos == p]), summ)), 2))
}
