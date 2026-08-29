# Per-player-week fantasy game log for the /my-team "My Analysis" filter
# builder -- one row per (player, season, week) with fantasy points, the
# raw stat components, and home/away + win/loss flags (from
# load_schedules' `result` = home margin). Trailing two regular seasons
# (nflreadr::most_recent_season and the one before).
#
# Writes upload_player_game_log.csv -- publish with
# web/scripts/publish-player-game-log.mjs (full refresh into the
# public.player_game_log table, migration 0027). Re-run whenever the
# weekly game log updates.
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
keep <- c("player_display_name", "position", "team", "opponent_team",
          "season", "week", "fantasy_points_ppr",
          "receptions", "targets", "receiving_yards", "receiving_tds",
          "rushing_yards", "carries", "rushing_tds",
          "passing_yards", "passing_tds")
keep <- intersect(keep, names(ps))
ps <- ps[ps$season_type == "REG" &
           ps$position %in% POSITIONS &
           !is.na(ps$fantasy_points_ppr), keep]

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
