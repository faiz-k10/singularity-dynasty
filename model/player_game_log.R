# Per-player-week fantasy game log for the /my-team "My Analysis" filter
# builder -- one row per (player, season, week) with fantasy points, the
# raw stat components, home/away + win/loss flags (from load_schedules'
# `result` = home margin), and ffopportunity's expected PPR fantasy points
# (xFP) for that game so My Analysis can plot points-over-expected.
# Trailing two regular seasons (nflreadr::most_recent_season and the one
# before).
#
# xFP source: nflreadr::load_ff_opportunity(stat_type = "weekly") ->
# total_fantasy_points_exp. It's PPR-scored (rec/rush fantasy points at
# 1 PPR, pass at 0.04/yd + 4/TD - 2/INT), so it lines up directly with
# fantasy_points_ppr. Keyed on GSIS player_id == load_player_stats$player_id,
# so the join is exact (no name matching). The model is ffopportunity
# v1.0.0 (never retrained) and the automated data release can lag mid-season
# -- weeks with no xFP row just get NA and drop out of the expected metrics.
#
# Writes upload_player_game_log.csv -- publish with
# web/scripts/publish-player-game-log.mjs (full refresh into the
# public.player_game_log table, migrations 0027 + 0028). Re-run whenever
# the weekly game log updates.
#
# Run: Rscript player_game_log.R

suppressMessages(library(nflreadr))

LATEST    <- most_recent_season(roster = FALSE)
SEASONS   <- (LATEST - 1):LATEST
POSITIONS <- c("QB", "RB", "WR", "TE")

# Same normalization as web/lib/portfolio.js normalizePlayerName -- the
# join key between Sleeper roster names and this table.
normalize_name <- function(x) {
  x <- tolower(gsub("\\.", "", x))
  x <- gsub("\\s+(jr|sr|ii|iii|iv|v)$", "", x)
  trimws(x)
}

cat("Loading weekly player stats + schedules,", paste(SEASONS, collapse = "-"), "...\n")
ps <- as.data.frame(load_player_stats(seasons = SEASONS))
keep <- c("player_id", "player_display_name", "position", "team", "opponent_team",
          "season", "week", "fantasy_points_ppr",
          "receptions", "targets", "receiving_yards", "receiving_tds",
          "rushing_yards", "carries", "rushing_tds",
          "passing_yards", "passing_tds")
keep <- intersect(keep, names(ps))
ps <- ps[ps$season_type == "REG" &
           ps$position %in% POSITIONS &
           !is.na(ps$fantasy_points_ppr), keep]

# Games he was ON THE FIELD for but has no stat line in: nflverse's weekly stats only carry players with a recorded stat, so a player
# who got snaps and no touches (a healthy player benched after a fumble, a blocking TE, a QB2 on a kneel-down) has NO row there -- the
# game just disappeared from Recent Games, "Last week" and the badge inputs (Cam Skattebo, 2026 week 6: 6 offensive snaps, no carries,
# no target, nothing in the log). Snap counts (nflreadr::load_snap_counts, keyed on the PFR id) say who was on the field, so each
# (player, season, week) with offense snaps and no stats row is added as a real 0.0 game. A player with NO snaps (inactive, injured,
# healthy scratch) gets no row: he did not play. Joined to GSIS ids through load_players().
cat("Adding zero-point games for players who had offense snaps but no stat line...\n")
sn <- as.data.frame(load_snap_counts(seasons = SEASONS))
sn <- sn[sn$game_type == "REG" & sn$position %in% POSITIONS & !is.na(sn$offense_snaps) & sn$offense_snaps > 0, ]
pl <- as.data.frame(load_players())
pl <- pl[!is.na(pl$pfr_id) & !is.na(pl$gsis_id), c("pfr_id", "gsis_id", "display_name")]
pl <- pl[!duplicated(pl$pfr_id), ]
sn <- merge(sn, pl, by.x = "pfr_player_id", by.y = "pfr_id")
have <- paste(ps$player_id, ps$season, ps$week)
sn <- sn[!(paste(sn$gsis_id, sn$season, sn$week) %in% have), ]
if (nrow(sn)) {
  zero <- data.frame(player_id = sn$gsis_id, player_display_name = sn$display_name, position = sn$position,
                     team = sn$team, opponent_team = sn$opponent, season = sn$season, week = sn$week,
                     fantasy_points_ppr = 0, stringsAsFactors = FALSE)
  for (col in setdiff(names(ps), names(zero))) zero[[col]] <- NA
  ps <- rbind(ps, zero[, names(ps)])
}
cat("  added", nrow(sn), "zero-point games\n")

# ffopportunity expected PPR points (xFP), joined on GSIS player_id +
# season + week. all.x -- a game with no xFP row keeps NA.
cat("Loading ffopportunity expected fantasy points (weekly xFP)...\n")
xfp <- as.data.frame(load_ff_opportunity(seasons = SEASONS, stat_type = "weekly"))
xfp <- xfp[, c("player_id", "season", "week", "total_fantasy_points_exp")]
names(xfp)[names(xfp) == "total_fantasy_points_exp"] <- "exp_points_ppr"
ps <- merge(ps, xfp, by = c("player_id", "season", "week"), all.x = TRUE)
cat("  xFP matched", sum(!is.na(ps$exp_points_ppr)), "of", nrow(ps), "player-weeks\n")

sched <- as.data.frame(load_schedules(seasons = SEASONS))
sched <- sched[sched$game_type == "REG",
               c("season", "week", "home_team", "away_team", "result")]

d <- merge(ps, sched, by = c("season", "week"), all.x = TRUE)
d$is_home <- !is.na(d$home_team) & d$team == d$home_team
d$is_away <- !is.na(d$away_team) & d$team == d$away_team
d <- d[d$is_home | d$is_away, ]
# result = home margin; ties -> won = FALSE (no wins/losses filter match)
d$won <- (d$is_home & d$result > 0) | (d$is_away & d$result < 0)

num0 <- function(v) { v[is.na(v)] <- 0; round(v, 1) }

out <- data.frame(
  normalized_name    = normalize_name(d$player_display_name),
  player_name        = d$player_display_name,
  position           = d$position,
  season             = d$season,
  week               = d$week,
  team               = d$team,
  opponent           = d$opponent_team,
  is_home            = d$is_home,
  won                = d$won,
  fantasy_points_ppr = round(d$fantasy_points_ppr, 1),
  exp_points_ppr     = round(d$exp_points_ppr, 1),
  receptions         = num0(d$receptions),
  targets            = num0(d$targets),
  rec_yards          = num0(d$receiving_yards),
  rush_yards         = num0(d$rushing_yards),
  rush_att           = num0(d$carries),
  pass_yards         = num0(d$passing_yards),
  tds = num0(d$receiving_tds) + num0(d$rushing_tds) + num0(d$passing_tds),
  stringsAsFactors = FALSE
)
out <- out[order(out$player_name, out$season, out$week), ]

write.csv(out, "upload_player_game_log.csv", row.names = FALSE, na = "")
cat("Wrote upload_player_game_log.csv --", nrow(out), "player-weeks,",
    length(unique(out$player_name)), "players (seasons", paste(SEASONS, collapse = "-"), ")\n\n")
print(head(out[, c("player_name", "season", "week", "opponent", "is_home", "won", "fantasy_points_ppr")], 8),
      row.names = FALSE)
