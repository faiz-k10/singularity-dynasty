# Backtest: identify games a player left injured (a real signal, not an
# inferred one -- nflreadr's play-by-play `desc` field contains explicit
# "TEAM-##-F.Last was injured during the play" / "... has returned to the
# game" markers) and test whether excluding those specific games from
# recency-decay history improves next-game prediction accuracy. More
# targeted than the snap-share filter (both tried and rejected at 50% and
# 30% -- see README): this only excludes games with a CONFIRMED in-game
# injury event, not every low-snap game for any reason (committee role,
# blowout rest, coach's decision), which is what made the snap filter
# throw away real signal along with noise.
#
# Real motivating case, confirmed directly: Jaylen Waddle's Week 17 2025
# game (25% snaps, 0.7 points, the game that started this whole
# investigation) has a real "MIA-17-J.Waddle ... was injured during the
# play" / "has returned to the game" pair in the play-by-play -- he was
# hurt, came back, but was evidently limited the rest of the game.
#
# Method: parse every injury/return event from play-by-play (regex on
# `desc`, ~99.6% parse rate checked by hand), resolve team+jersey_number
# to a real player via load_rosters() (season-level jersey numbers, not
# week-level -- an in-season number change is rare enough to accept as
# noise). Two candidate exclusion definitions tested separately, since
# it's not obvious which is right:
#   A) "injured and never returned" -- the strict definition, only
#      excludes games actually cut short.
#   B) "any injury event that game, return or not" -- catches Waddle's
#      exact case (he DID return, per the play-by-play, but still
#      finished at only 25% snaps -- a strict no-return rule would have
#      missed the very case that motivated this).
# Same fair-comparison discipline as the snap-share filter's corrected
# test: SAME target game predicted either way, only the input history
# differs, decay re-swept for whichever candidate is being tested.
#
# Run: Rscript backtest_injury_exit_filter.R

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
  o <- order(x); x <- x[o]; w <- w[o]
  cw <- (cumsum(w) - 0.5 * w) / sum(w)
  as.numeric(approx(cw, x, q, rule = 2)$y)
}

all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)

cat("Loading player stats...\n")
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
reg <- raw[raw$season_type == "REG",
           c("player_display_name", "position", "season", "week", "fantasy_points_ppr")]
reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
reg <- reg[!is.na(reg$fantasy_points_ppr), ]
reg <- reg[order(reg$player_display_name, reg$season, reg$week), ]
cat("Loaded", nrow(reg), "rows.\n\n")

cat("Loading rosters (jersey number resolution)...\n")
ros <- as.data.frame(load_rosters(seasons = all_seasons))
ros_key <- paste(ros$team, ros$jersey_number, ros$season)
ros_lookup <- setNames(ros$full_name, ros_key)
ros_lookup <- ros_lookup[!duplicated(names(ros_lookup))]

cat("Loading play-by-play (this is the slow part)...\n")
pbp <- as.data.frame(load_pbp(seasons = all_seasons))
cat("Loaded", nrow(pbp), "plays.\n\n")

pat_inj <- "([A-Z]{2,3})-([0-9]{1,2})-([A-Za-z.'-]+) was injured during the play"
pat_ret <- "([A-Z]{2,3})-([0-9]{1,2})-([A-Za-z.'-]+) has returned to the game"

extract_events <- function(pattern, desc, game_id, week, season) {
  m <- regmatches(desc, regexec(pattern, desc))
  hit <- sapply(m, length) > 0
  data.frame(
    game_id = game_id[hit], week = week[hit], season = season[hit],
    team = sapply(m[hit], `[`, 2), jersey = sapply(m[hit], `[`, 3),
    stringsAsFactors = FALSE
  )
}
inj_events <- extract_events(pat_inj, pbp$desc, pbp$game_id, pbp$week, pbp$season)
ret_events <- extract_events(pat_ret, pbp$desc, pbp$game_id, pbp$week, pbp$season)
cat("Parsed", nrow(inj_events), "injury events,", nrow(ret_events), "return events.\n")

resolve_name <- function(events) {
  key <- paste(events$team, events$jersey, events$season)
  events$player_display_name <- unname(ros_lookup[key])
  events[!is.na(events$player_display_name), ]
}
inj_events <- resolve_name(inj_events)
ret_events <- resolve_name(ret_events)
cat("Resolved to real players:", nrow(inj_events), "injury,", nrow(ret_events), "return.\n\n")

# Definition A: injured AND no return event in the same game_id+player.
inj_key <- paste(inj_events$player_display_name, inj_events$game_id)
ret_key <- paste(ret_events$player_display_name, ret_events$game_id)
def_a_key <- unique(inj_key[!(inj_key %in% ret_key)])
# Definition B: any injury event that game, return or not.
def_b_key <- unique(inj_key)

reg$game_key_a <- paste(reg$player_display_name, reg$season, reg$week)
inj_a_pw <- unique(paste(inj_events$player_display_name[!(inj_key %in% ret_key)],
                          inj_events$season[!(inj_key %in% ret_key)],
                          inj_events$week[!(inj_key %in% ret_key)]))
inj_b_pw <- unique(paste(inj_events$player_display_name, inj_events$season, inj_events$week))

reg$flagged_a <- reg$game_key_a %in% inj_a_pw
reg$flagged_b <- reg$game_key_a %in% inj_b_pw
cat("Definition A (injured, no return) flags", sum(reg$flagged_a), "of", nrow(reg), "rows.\n")
cat("Definition B (any injury event) flags", sum(reg$flagged_b), "of", nrow(reg), "rows.\n\n")

run_fair_test <- function(flag_col, label) {
  cat("=== ", label, " ===\n", sep = "")
  reg$keep <- !reg[[flag_col]]

  build_eval <- function(dataset) {
    pts <- list(); i <- 0
    for (p in unique(dataset$player_display_name)) {
      d <- dataset[dataset$player_display_name == p & dataset$keep, ]
      n <- nrow(d)
      if (n < MIN_HIST_GAMES + 1) next
      for (k in (MIN_HIST_GAMES + 1):n) {
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
    pts <- build_eval(dpos)
    scores <- sapply(DECAY_GRID, function(dc) {
      mean(sapply(pts, function(e) {
        w <- recency_weights(nrow(e$hist), dc)
        abs(e$actual - weighted_quantile(e$hist$fantasy_points_ppr, w, 0.50))
      }))
    })
    new_decay[pos] <- DECAY_GRID[which.min(scores)]
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
      hist_all <- d[1:(i - 1), ]
      hist_filt <- hist_all[hist_all$keep, ]
      actual <- d$fantasy_points_ppr[i]
      if (nrow(hist_all) >= MIN_HIST_GAMES) {
        w <- recency_weights(nrow(hist_all), OLD_MED_DECAY[[pos]])
        old_err[[pos]] <- c(old_err[[pos]], abs(actual - weighted_quantile(hist_all$fantasy_points_ppr, w, 0.50)))
      }
      if (nrow(hist_filt) >= MIN_HIST_GAMES) {
        w <- recency_weights(nrow(hist_filt), new_decay[[pos]])
        new_err[[pos]] <- c(new_err[[pos]], abs(actual - weighted_quantile(hist_filt$fantasy_points_ppr, w, 0.50)))
      }
    }
  }
  for (pos in c("QB", "RB", "WR", "TE")) {
    mb <- mean(old_err[[pos]]); mn <- mean(new_err[[pos]])
    cat(sprintf("%s  old(d=%.2f) n=%d MAE=%.4f   new(d=%.2f) n=%d MAE=%.4f   change=%+.2f%%\n",
                pos, OLD_MED_DECAY[pos], length(old_err[[pos]]), mb,
                new_decay[pos], length(new_err[[pos]]), mn, 100*(mn-mb)/mb))
  }
  cat("\n")
}

run_fair_test("flagged_a", "Definition A: injured, no return")
run_fair_test("flagged_b", "Definition B: any injury event that game")
