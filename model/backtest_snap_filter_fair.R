# Corrected head-to-head for the snap-share filter (see MIN_SNAP_PCT in
# projection_engine.R). backtest_snap_filter_decay.R's first attempt at
# this comparison was flawed: it built walk-forward evaluation points
# separately from the filtered and unfiltered game sequences, which means
# the two sides were predicting DIFFERENT target games, not just using
# different history to predict the same one -- not a fair comparison.
#
# Real use case: every week we're about to project whatever a player's
# actual next game turns out to be (we don't get to pick a "nicer"
# target game for one method over the other). So this fixes the target
# population: build ONE set of walk-forward targets from the full
# (unfiltered) game log, and for each, compute two competing predictions
# -- one from all prior history, one from only prior history above
# MIN_SNAP_PCT -- scored against the SAME real actual outcome.
#
# Run: Rscript backtest_snap_filter_fair.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 8
MIN_SNAP_PCT <- 0.50
OLD_MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
NEW_MED_DECAY <- c(RB = 0.94, QB = 0.94, WR = 0.94, TE = 0.97)  # from backtest_snap_filter_decay.R's sweep

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
reg$above_snap <- is.na(reg$snap_pct) | reg$snap_pct > MIN_SNAP_PCT  # fail-open, matches production
reg <- reg[order(reg$player_display_name, reg$season, reg$week), ]
cat("Loaded", nrow(reg), "rows,", sum(!reg$above_snap), "below the snap threshold.\n\n")

old_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
new_err <- list(QB=c(), RB=c(), WR=c(), TE=c())

for (p in unique(reg$player_display_name)) {
  d <- reg[reg$player_display_name == p, ]
  pos <- d$position[1]
  n <- nrow(d)
  if (n < MIN_HIST_GAMES + 1) next

  for (i in (MIN_HIST_GAMES + 1):n) {
    if (!(d$season[i] %in% TEST_SEASONS)) next  # same target population for both methods
    hist_all <- d[1:(i - 1), ]
    hist_filt <- hist_all[hist_all$above_snap, ]
    actual <- d$fantasy_points_ppr[i]

    if (nrow(hist_all) >= MIN_HIST_GAMES) {
      w <- recency_weights(nrow(hist_all), OLD_MED_DECAY[[pos]])
      pred_old <- weighted_quantile(hist_all$fantasy_points_ppr, w, 0.50)
      old_err[[pos]] <- c(old_err[[pos]], abs(actual - pred_old))
    }
    if (nrow(hist_filt) >= MIN_HIST_GAMES) {
      w <- recency_weights(nrow(hist_filt), NEW_MED_DECAY[[pos]])
      pred_new <- weighted_quantile(hist_filt$fantasy_points_ppr, w, 0.50)
      new_err[[pos]] <- c(new_err[[pos]], abs(actual - pred_new))
    }
  }
}

cat("=== Fair comparison: same target games, different history ===\n")
cat("(n differs slightly per method -- a player can clear MIN_HIST_GAMES on\n")
cat(" all-history but not yet on filtered-history-only, or vice versa)\n\n")
for (pos in c("QB", "RB", "WR", "TE")) {
  cat(sprintf("%s  old(unfiltered,d=%.2f) n=%d MAE=%.4f   new(filtered,d=%.2f) n=%d MAE=%.4f\n",
              pos, OLD_MED_DECAY[pos], length(old_err[[pos]]), mean(old_err[[pos]]),
              NEW_MED_DECAY[pos], length(new_err[[pos]]), mean(new_err[[pos]])))
}
