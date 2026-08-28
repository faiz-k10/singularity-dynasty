# Reusable per-player-season metadata: age, experience, draft capital,
# size, college, status -- from nflreadr::load_rosters() +
# load_draft_picks(). Source this from projection_engine.R (age/draft
# priors) and from any analysis script.
#
#   source("player_meta.R")
#   meta <- player_meta(2015:2025)          # data.frame, one row per (gsis_id, season)
#
# Join key is gsis_id, which equals load_player_stats()$player_id exactly
# -- no name matching needed on the model side. sleeper_id is carried
# through for the website's /my-team join (that side has Sleeper ids, not
# gsis).
#
# Coverage (checked 2010-2025, skill positions, >=8-game seasons):
#   - age (birth_date): 100% for fantasy-relevant players
#   - draft_round/pick: present for drafted players; NA = undrafted
#     (is_udfa flags the real UDFAs vs. not-yet-known rookies)
#   - sleeper_id: ~99% for fantasy-relevant players

suppressMessages(library(nflreadr))

PLAYER_META_POSITIONS <- c("QB", "RB", "WR", "TE")
# Age measured as of Sept 1 of the season (season kickoff-ish), so a
# player's "age" is what he plays that whole season at, not his birthday
# count on some arbitrary date.
PLAYER_META_SEASON_ANCHOR <- "-09-01"

player_meta <- function(seasons, positions = PLAYER_META_POSITIONS) {
  ros <- as.data.frame(load_rosters(seasons))
  ros <- ros[ros$position %in% positions, ]

  # load_draft_picks() carries the round/pick split load_rosters() lacks
  # (roster rows only have draft_number = overall pick).
  dp <- as.data.frame(load_draft_picks())
  dp <- dp[!is.na(dp$gsis_id), c("gsis_id", "season", "round", "pick")]
  names(dp) <- c("gsis_id", "draft_year", "draft_round", "draft_pick")
  dp <- dp[!duplicated(dp$gsis_id), ]

  m <- merge(ros, dp, by = "gsis_id", all.x = TRUE)

  anchor <- as.Date(paste0(m$season, PLAYER_META_SEASON_ANCHOR))
  m$age <- round(as.numeric(anchor - as.Date(m$birth_date)) / 365.25, 2)

  m$draft_number <- suppressWarnings(as.numeric(m$draft_number))
  m$draft_overall <- ifelse(!is.na(m$draft_pick), m$draft_pick, m$draft_number)
  # fill round from overall pick when only draft_number (roster row) was
  # available and the load_draft_picks join missed.
  m$draft_round <- ifelse(is.na(m$draft_round) & !is.na(m$draft_overall),
                          pmin(ceiling(m$draft_overall / 32), 7L), m$draft_round)
  # real UDFA = has an NFL entry year but no draft pick anywhere.
  m$is_udfa <- is.na(m$draft_overall) & !is.na(m$entry_year)

  out <- m[, c(
    "gsis_id", "season", "full_name", "position", "team",
    "age", "birth_date", "years_exp", "entry_year", "rookie_year",
    "draft_year", "draft_round", "draft_pick", "draft_overall", "is_udfa",
    "height", "weight", "college", "status", "sleeper_id"
  )]
  out <- out[!duplicated(out[, c("gsis_id", "season")]), ]
  out[order(out$season, out$position, out$full_name), ]
}
