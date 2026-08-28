# Follow-up to backtest_injury_exit_filter.R: that test showed ~neutral
# aggregate impact, which is expected given only ~2.5-3% of all games are
# injury-flagged -- the aggregate average washes out a rare event almost
# by construction. The real question is narrower: for the exact
# situation that motivated this (a player's MOST RECENT game before the
# one being predicted was an injury-exit game), does excluding it help?
# Same fair-comparison discipline, but scoped to trigger-only rows
# (same pattern as the bounce-back backtest's own trigger-only cut).
#
# Run: Rscript backtest_injury_exit_trigger_only.R

suppressMessages(library(nflreadr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- 2022:2025
LOOKBACK_YEARS <- 3
MIN_HIST_GAMES <- 8
OLD_MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)

all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)

cat("Loading (should be fast, nflreadr caches on disk after first pull)...\n")
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
reg <- raw[raw$season_type == "REG",
           c("player_display_name", "position", "season", "week", "fantasy_points_ppr")]
reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
reg <- reg[!is.na(reg$fantasy_points_ppr), ]
reg <- reg[order(reg$player_display_name, reg$season, reg$week), ]

ros <- as.data.frame(load_rosters(seasons = all_seasons))
ros_key <- paste(ros$team, ros$jersey_number, ros$season)
ros_lookup <- setNames(ros$full_name, ros_key)
ros_lookup <- ros_lookup[!duplicated(names(ros_lookup))]

pbp <- as.data.frame(load_pbp(seasons = all_seasons))
cat("Loaded", nrow(pbp), "plays.\n")

pat_inj <- "([A-Z]{2,3})-([0-9]{1,2})-([A-Za-z.'-]+) was injured during the play"
extract_events <- function(pattern, desc, game_id, week, season) {
  m <- regmatches(desc, regexec(pattern, desc))
  hit <- sapply(m, length) > 0
  data.frame(game_id = game_id[hit], week = week[hit], season = season[hit],
             team = sapply(m[hit], `[`, 2), jersey = sapply(m[hit], `[`, 3),
             stringsAsFactors = FALSE)
}
inj_events <- extract_events(pat_inj, pbp$desc, pbp$game_id, pbp$week, pbp$season)
inj_key <- paste(inj_events$team, inj_events$jersey, inj_events$season)
inj_events$player_display_name <- unname(ros_lookup[inj_key])
inj_events <- inj_events[!is.na(inj_events$player_display_name), ]
# Definition B (any injury event that game) -- the one that actually
# matches Waddle's case (he returned, still got flagged).
inj_pw <- unique(paste(inj_events$player_display_name, inj_events$season, inj_events$week))
reg$flagged <- paste(reg$player_display_name, reg$season, reg$week) %in% inj_pw
cat("Flagged", sum(reg$flagged), "of", nrow(reg), "rows.\n\n")

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_quantile <- function(x, w, q) {
  o <- order(x); x <- x[o]; w <- w[o]
  cw <- (cumsum(w) - 0.5 * w) / sum(w)
  as.numeric(approx(cw, x, q, rule = 2)$y)
}

old_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
new_err <- list(QB=c(), RB=c(), WR=c(), TE=c())

for (p in unique(reg$player_display_name)) {
  d <- reg[reg$player_display_name == p, ]
  pos <- d$position[1]
  n <- nrow(d)
  if (n < MIN_HIST_GAMES + 1) next
  for (i in (MIN_HIST_GAMES + 1):n) {
    if (!(d$season[i] %in% TEST_SEASONS)) next
    if (!d$flagged[i - 1]) next  # TRIGGER ONLY: most recent game was injury-flagged
    hist_all <- d[1:(i - 1), ]
    hist_excl <- hist_all[!hist_all$flagged, ]
    actual <- d$fantasy_points_ppr[i]
    if (nrow(hist_all) >= MIN_HIST_GAMES) {
      w <- recency_weights(nrow(hist_all), OLD_MED_DECAY[[pos]])
      old_err[[pos]] <- c(old_err[[pos]], abs(actual - weighted_quantile(hist_all$fantasy_points_ppr, w, 0.50)))
    }
    if (nrow(hist_excl) >= MIN_HIST_GAMES) {
      w <- recency_weights(nrow(hist_excl), OLD_MED_DECAY[[pos]])  # same decay -- isolating just the exclusion's effect
      new_err[[pos]] <- c(new_err[[pos]], abs(actual - weighted_quantile(hist_excl$fantasy_points_ppr, w, 0.50)))
    }
  }
}

cat("=== Trigger-only: most recent game was injury-flagged ===\n")
for (pos in c("QB", "RB", "WR", "TE")) {
  mb <- mean(old_err[[pos]]); mn <- mean(new_err[[pos]])
  cat(sprintf("%s  keep-injury-game n=%d MAE=%.4f   exclude-injury-game n=%d MAE=%.4f   change=%+.2f%%\n",
              pos, length(old_err[[pos]]), mb, length(new_err[[pos]]), mn, 100*(mn-mb)/mb))
}
