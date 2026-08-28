# Same idea as backtest_snap_filter_fair.R (which tested a 50% snap-share
# cutoff and found it hurt every position once tested fairly), retried at
# a much less aggressive 30% cutoff -- excludes true afterthought games
# (Waddle's motivating case was 25% snaps, still excluded at this
# threshold) without also excluding real committee-role/rotational usage
# the 50% cutoff was throwing out.
#
# Two-step, same discipline as the 50% version: (1) re-sweep MED_DECAY
# per position against the 30%-filtered data (decay tuned for unfiltered
# history isn't necessarily still right once the data changes), then
# (2) fair head-to-head -- SAME target game predicted either way, only
# the input history differs -- old (unfiltered, old decay) vs. new
# (30%-filtered, re-tuned decay).
#
# Run: Rscript backtest_snap30_fair.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 8
MIN_SNAP_PCT <- 0.30
DECAY_GRID <- seq(0.70, 0.97, by = 0.03)
OLD_MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)

normalize_join_name <- function(name) {
  tolower(gsub("\\s+(jr|sr|ii|iii|iv|v)$", "", gsub("\\.", "", name), ignore.case = TRUE))
}
recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_quantile <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]
  cw <- (cumsum(w) - 0.5 * w) / sum(w)
  as.numeric(approx(cw, x, q, rule = 2)$y)
}

cat("Loading nflreadr data...\n")
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
reg <- raw[raw$season_type == "REG",
           c("player_display_name", "position", "season", "week", "fantasy_points_ppr")]
reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
reg <- reg[!is.na(reg$fantasy_points_ppr), ]

sc <- as.data.frame(load_snap_counts(seasons = all_seasons))
sc <- sc[!is.na(sc$offense_pct), ]
snap_key <- paste(normalize_join_name(sc$player), sc$season, sc$week)
snap_lookup <- setNames(sc$offense_pct, snap_key)
reg_key <- paste(normalize_join_name(reg$player_display_name), reg$season, reg$week)
reg$snap_pct <- unname(snap_lookup[reg_key])
reg$above_snap <- is.na(reg$snap_pct) | reg$snap_pct > MIN_SNAP_PCT  # fail-open
reg <- reg[order(reg$player_display_name, reg$season, reg$week), ]

removed_pct <- 100 * mean(!reg$above_snap, na.rm = TRUE)
cat("Loaded", nrow(reg), "rows,", sum(!reg$above_snap),
    sprintf("(%.1f%%) below the %.0f%% snap threshold.\n\n", removed_pct, MIN_SNAP_PCT * 100))

# ---- Step 1: re-sweep MED_DECAY per position on the 30%-filtered data ----
build_eval_points_filtered <- function(dataset, min_hist) {
  pts <- list(); i <- 0
  for (p in unique(dataset$player_display_name)) {
    d <- dataset[dataset$player_display_name == p & dataset$above_snap, ]
    n <- nrow(d)
    if (n < min_hist + 1) next
    for (k in (min_hist + 1):n) {
      if (!(d$season[k] %in% TEST_SEASONS)) next
      i <- i + 1
      pts[[i]] <- list(hist = d[1:(k - 1), ], actual = d$fantasy_points_ppr[k])
    }
  }
  pts
}

new_med_decay <- c()
for (pos in c("QB", "RB", "WR", "TE")) {
  dpos <- reg[reg$position == pos, ]
  pts <- build_eval_points_filtered(dpos, MIN_HIST_GAMES)
  scores <- sapply(DECAY_GRID, function(dc) {
    mean(sapply(pts, function(e) {
      w <- recency_weights(nrow(e$hist), dc)
      abs(e$actual - weighted_quantile(e$hist$fantasy_points_ppr, w, 0.50))
    }))
  })
  best <- DECAY_GRID[which.min(scores)]
  new_med_decay[pos] <- best
  cat(sprintf("%s: best decay on 30%%-filtered data = %.2f (old: %.2f), MAE at best = %.4f\n",
              pos, best, OLD_MED_DECAY[pos], min(scores)))
}

# ---- Step 2: fair head-to-head, SAME target games, different history ----
cat("\n=== Fair comparison: same target games, different history ===\n")
old_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
new_err <- list(QB=c(), RB=c(), WR=c(), TE=c())

for (p in unique(reg$player_display_name)) {
  d <- reg[reg$player_display_name == p, ]
  pos <- d$position[1]
  n <- nrow(d)
  if (n < MIN_HIST_GAMES + 1) next

  for (i in (MIN_HIST_GAMES + 1):n) {
    if (!(d$season[i] %in% TEST_SEASONS)) next
    hist_all <- d[1:(i - 1), ]
    hist_filt <- hist_all[hist_all$above_snap, ]
    actual <- d$fantasy_points_ppr[i]

    if (nrow(hist_all) >= MIN_HIST_GAMES) {
      w <- recency_weights(nrow(hist_all), OLD_MED_DECAY[[pos]])
      pred_old <- weighted_quantile(hist_all$fantasy_points_ppr, w, 0.50)
      old_err[[pos]] <- c(old_err[[pos]], abs(actual - pred_old))
    }
    if (nrow(hist_filt) >= MIN_HIST_GAMES) {
      w <- recency_weights(nrow(hist_filt), new_med_decay[[pos]])
      pred_new <- weighted_quantile(hist_filt$fantasy_points_ppr, w, 0.50)
      new_err[[pos]] <- c(new_err[[pos]], abs(actual - pred_new))
    }
  }
}

for (pos in c("QB", "RB", "WR", "TE")) {
  mb <- mean(old_err[[pos]]); mn <- mean(new_err[[pos]])
  cat(sprintf("%s  old(unfiltered,d=%.2f) n=%d MAE=%.4f   new(30%%-filtered,d=%.2f) n=%d MAE=%.4f   change=%+.2f%%\n",
              pos, OLD_MED_DECAY[pos], length(old_err[[pos]]), mb,
              new_med_decay[pos], length(new_err[[pos]]), mn, 100*(mn-mb)/mb))
}
