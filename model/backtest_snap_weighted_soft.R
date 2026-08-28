# Soft/continuous version of the snap-share idea, structurally different
# from the two hard-cutoff attempts already rejected (backtest_snap_filter_fair.R
# at 50%, backtest_snap30_fair.R at 30%, both worse than unfiltered for
# every position). Instead of a binary include/exclude by threshold,
# scale each game's normal recency weight by its own snap share -- a
# 25%-snap game still counts, just at ~25% of the influence it would
# otherwise get, instead of either full weight or zero. Preserves partial
# information (the hard cutoffs' likely failure mode) while still
# reducing the influence of games like Jaylen Waddle's Week 17 (25%
# snaps, 0.7 points) that dominated his recency weighting despite barely
# reflecting his real role.
#
# weight_i = recency_weight_i * snap_pct_i (fails open: missing snap
# data = multiply by 1, unchanged -- same policy as every other snap-data
# join this session).
#
# Same fair-comparison discipline: SAME target game either way, only the
# weighting of input history differs. Decay re-swept for the treatment
# since scaling weights changes what the optimal underlying decay is.
#
# Run: Rscript backtest_snap_weighted_soft.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 8
DECAY_GRID <- seq(0.70, 0.97, by = 0.03)
OLD_MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)

normalize_join_name <- function(name) {
  tolower(gsub("\\s+(jr|sr|ii|iii|iv|v)$", "", gsub("\\.", "", name), ignore.case = TRUE))
}
recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_quantile <- function(x, w, q) {
  # Guard: if every game in this player's history had snap_mult ~0 (rare
  # edge case -- a stat line with genuinely 0 offensive snaps some week,
  # e.g. a hybrid special-teams/emergency appearance), sum(w) collapses
  # to 0 and approx() has nothing to interpolate. Fall back to an
  # unweighted (equal-weight) quantile rather than crash -- a real
  # players eligible for a projection at all always has SOME real
  # history, this only degenerates when every single game this specific
  # weight vector covers was a true zero-snap week.
  if (sum(w) <= 0) w <- rep(1, length(w))
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
reg$snap_mult <- ifelse(is.na(reg$snap_pct), 1, reg$snap_pct)  # fail-open
reg <- reg[order(reg$player_display_name, reg$season, reg$week), ]
cat("Loaded", nrow(reg), "rows. Avg snap_mult:", round(mean(reg$snap_mult), 3), "\n\n")

# ---- Step 1: re-sweep MED_DECAY with soft snap-weighting applied ----
build_eval <- function(dataset, min_hist) {
  pts <- list(); i <- 0
  for (p in unique(dataset$player_display_name)) {
    d <- dataset[dataset$player_display_name == p, ]
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

new_decay <- c()
for (pos in c("QB", "RB", "WR", "TE")) {
  dpos <- reg[reg$position == pos, ]
  pts <- build_eval(dpos, MIN_HIST_GAMES)
  scores <- sapply(DECAY_GRID, function(dc) {
    mean(sapply(pts, function(e) {
      w <- recency_weights(nrow(e$hist), dc) * e$hist$snap_mult
      abs(e$actual - weighted_quantile(e$hist$fantasy_points_ppr, w, 0.50))
    }))
  })
  best <- DECAY_GRID[which.min(scores)]
  new_decay[pos] <- best
  cat(sprintf("%s: best decay w/ soft snap-weighting = %.2f (old: %.2f), MAE at best = %.4f\n",
              pos, best, OLD_MED_DECAY[pos], min(scores)))
}

# ---- Step 2: fair head-to-head ----
cat("\n=== Fair comparison: same target games, different weighting ===\n")
old_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
new_err <- list(QB=c(), RB=c(), WR=c(), TE=c())

for (p in unique(reg$player_display_name)) {
  d <- reg[reg$player_display_name == p, ]
  pos <- d$position[1]
  n <- nrow(d)
  if (n < MIN_HIST_GAMES + 1) next
  for (i in (MIN_HIST_GAMES + 1):n) {
    if (!(d$season[i] %in% TEST_SEASONS)) next
    hist <- d[1:(i - 1), ]
    actual <- d$fantasy_points_ppr[i]

    w_old <- recency_weights(nrow(hist), OLD_MED_DECAY[[pos]])
    pred_old <- weighted_quantile(hist$fantasy_points_ppr, w_old, 0.50)
    old_err[[pos]] <- c(old_err[[pos]], abs(actual - pred_old))

    w_new <- recency_weights(nrow(hist), new_decay[[pos]]) * hist$snap_mult
    pred_new <- weighted_quantile(hist$fantasy_points_ppr, w_new, 0.50)
    new_err[[pos]] <- c(new_err[[pos]], abs(actual - pred_new))
  }
}
for (pos in c("QB", "RB", "WR", "TE")) {
  mb <- mean(old_err[[pos]]); mn <- mean(new_err[[pos]])
  cat(sprintf("%s  old(unfiltered,d=%.2f) MAE=%.4f   new(soft-weighted,d=%.2f) MAE=%.4f   change=%+.2f%%\n",
              pos, OLD_MED_DECAY[pos], mb, new_decay[pos], mn, 100*(mn-mb)/mb))
}

# ---- Step 3: does it actually fix Waddle's case? ----
cat("\n=== Waddle check ===\n")
wd <- reg[reg$player_display_name == "Jaylen Waddle", ]
n <- nrow(wd)
w_old <- recency_weights(n, OLD_MED_DECAY["WR"])
w_new <- recency_weights(n, new_decay["WR"]) * wd$snap_mult
cat("old median:", round(weighted_quantile(wd$fantasy_points_ppr, w_old, 0.50), 1), "\n")
cat("soft-weighted median:", round(weighted_quantile(wd$fantasy_points_ppr, w_new, 0.50), 1), "\n")
