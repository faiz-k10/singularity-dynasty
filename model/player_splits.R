# Per-player fantasy-point splits for the /my-team "My Analysis" scatter:
# home vs away, in wins vs losses, and last-4-game form -- from
# nflreadr's weekly player game log joined to the schedule. Trailing two
# completed regular seasons (nflreadr::most_recent_season and the one
# before it).
#
# One row per player. Writes upload_player_splits.csv -- publish with
# web/scripts/publish-player-splits.mjs (upsert on player_name into the
# public.player_splits table, migration 0026).
#
# Run: Rscript player_splits.R

suppressMessages(library(nflreadr))

LATEST    <- most_recent_season(roster = FALSE)
SEASONS   <- (LATEST - 1):LATEST
POSITIONS <- c("QB", "RB", "WR", "TE")
MIN_SPLIT_GAMES <- 2   # need >= this many games in a bucket to report its PPG
MIN_TOTAL_GAMES <- 4   # skip players with almost no recent sample
LAST_N <- 4

cat("Loading weekly player stats + schedules,", paste(SEASONS, collapse = "-"), "...\n")
ps <- as.data.frame(load_player_stats(seasons = SEASONS))
ps <- ps[ps$season_type == "REG" &
           ps$position %in% POSITIONS &
           !is.na(ps$fantasy_points_ppr), ]

sched <- as.data.frame(load_schedules(seasons = SEASONS))
sched <- sched[sched$game_type == "REG",
               c("season", "week", "home_team", "away_team", "result")]

# result = home margin (home_score - away_score). Attach it to each
# player-week and derive home/away + win/loss for the player's team.
d <- merge(ps, sched, by = c("season", "week"), all.x = TRUE)
d$is_home <- !is.na(d$home_team) & d$team == d$home_team
d$is_away <- !is.na(d$away_team) & d$team == d$away_team
d <- d[d$is_home | d$is_away, ]  # drop rows the schedule join couldn't place
d$won  <- (d$is_home & d$result > 0) | (d$is_away & d$result < 0)
d$lost <- (d$is_home & d$result < 0) | (d$is_away & d$result > 0)  # ties: neither
d <- d[order(d$player_display_name, d$season, d$week), ]

split_ppg <- function(v) if (length(v) >= MIN_SPLIT_GAMES) round(mean(v), 1) else NA_real_

rows <- lapply(split(d, d$player_display_name), function(p) {
  fp <- p$fantasy_points_ppr
  recent <- tail(fp, LAST_N)
  data.frame(
    player_name  = p$player_display_name[1],
    position     = p$position[1],
    games        = length(fp),
    ppg          = round(mean(fp), 1),
    games_home   = sum(p$is_home),
    ppg_home     = split_ppg(fp[p$is_home]),
    games_away   = sum(p$is_away),
    ppg_away     = split_ppg(fp[p$is_away]),
    games_wins   = sum(p$won),
    ppg_wins     = split_ppg(fp[p$won]),
    games_losses = sum(p$lost),
    ppg_losses   = split_ppg(fp[p$lost]),
    ppg_last4    = if (length(recent) >= MIN_SPLIT_GAMES) round(mean(recent), 1) else NA_real_,
    stringsAsFactors = FALSE
  )
})
out <- do.call(rbind, rows)
out <- out[out$games >= MIN_TOTAL_GAMES, ]
out <- out[order(-out$ppg), ]

write.csv(out, "upload_player_splits.csv", row.names = FALSE, na = "")
cat("Wrote upload_player_splits.csv --", nrow(out), "players (seasons", paste(SEASONS, collapse = "-"), ")\n\n")
print(head(out[, c("player_name", "games", "ppg", "ppg_home", "ppg_away",
                   "ppg_wins", "ppg_losses", "ppg_last4")], 10), row.names = FALSE)
