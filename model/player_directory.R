# Our own NFL player directory for the website (table player_directory, migration 0039): names, position, team, bio and a
# headshot link for every player who has played or been on a roster since last season, keyed by the player's Sleeper id (the key
# My Team's rosters use) -- from nflverse (load_players + the Sleeper crosswalk in load_ff_playerids) plus one row per team
# defense. It replaces the site's reads of Sleeper's 16MB player dictionary, so the only data we take from Sleeper is a user's own
# leagues. Writes upload_player_directory.csv; scripts/publish-player-directory.mjs upserts it (weekly-run.mjs runs both,
# never fatally).
#   Rscript player_directory.R
suppressMessages(library(nflreadr))

SEASON <- as.integer(format(Sys.Date(), "%Y"))
if (as.integer(format(Sys.Date(), "%m")) < 3) SEASON <- SEASON - 1L

p <- as.data.frame(load_players())
ids <- as.data.frame(load_ff_playerids())
ids <- ids[!is.na(ids$gsis_id) & !is.na(ids$sleeper_id), c("gsis_id", "sleeper_id")]
ids <- ids[!duplicated(ids$gsis_id), ]

p <- p[!is.na(p$gsis_id) & !is.na(p$last_season) & p$last_season >= SEASON - 1L & !is.na(p$position), ]
m <- merge(p, ids, by = "gsis_id")
m <- m[!duplicated(m$sleeper_id), ]

# nflverse uses LA for the Rams; Sleeper and ESPN use LAR (and the site's code expects that).
team_code <- function(t) ifelse(t == "LA", "LAR", t)
# Who counts as on a team right now: roster, practice squad and the reserve lists. Released / retired players have no team, like
# Sleeper's free agents.
on_team <- c("ACT", "RES", "PUP", "DEV", "SUS", "NWT", "EXE")
status_label <- c(ACT = "Active", RES = "Injured Reserve", PUP = "PUP", DEV = "Practice Squad", SUS = "Suspended", NWT = "NWT", EXE = "Exempt")
st <- as.character(m$status)

age_now <- function(d) round(as.numeric(Sys.Date() - as.Date(d)) / 365.25, 1)

out <- data.frame(
  sleeper_id = as.character(m$sleeper_id),
  gsis_id = m$gsis_id,
  # The name people use (football_name: "Dak", "Mike"), not the legal one; no suffix, like Sleeper's own last names.
  first_name = ifelse(!is.na(m$football_name), m$football_name, ifelse(!is.na(m$common_first_name), m$common_first_name, ifelse(is.na(m$first_name), "", m$first_name))),
  last_name = ifelse(is.na(m$last_name), m$display_name, m$last_name),
  position = m$position,
  team = ifelse(st %in% on_team, team_code(m$latest_team), NA),
  number = suppressWarnings(as.integer(m$jersey_number)),
  height = m$height,
  weight = suppressWarnings(as.integer(m$weight)),
  age = age_now(m$birth_date),
  birth_date = as.character(as.Date(m$birth_date)),
  years_exp = suppressWarnings(as.integer(m$years_of_experience)),
  college = m$college_name,
  status = ifelse(st %in% names(status_label), status_label[st], "Inactive"),
  # Photos are Sleeper's own thumbnails, built from the Sleeper id on the site (lib/sleeper.js) -- the founder's call; nothing stored here.
  headshot_url = NA_character_,
  stringsAsFactors = FALSE
)
out$last_name <- trimws(out$last_name)
out$first_name <- trimws(out$first_name)

# Team defenses: Sleeper's id for a defense is the team code.
tm <- as.data.frame(load_teams(current = TRUE))
tm$code <- team_code(tm$team_abbr)
defs <- data.frame(
  sleeper_id = tm$code, gsis_id = NA, first_name = unname(mapply(function(n, k) trimws(sub(paste0(k, "$"), "", n)), tm$team_name, tm$team_nick)),
  last_name = tm$team_nick, position = "DEF", team = tm$code, number = NA, height = NA, weight = NA, age = NA,
  birth_date = NA, years_exp = NA, college = NA, status = "Active", headshot_url = NA, stringsAsFactors = FALSE
)
defs <- defs[, names(out)]
out <- rbind(out, defs)

write.csv(out, "upload_player_directory.csv", row.names = FALSE, na = "")
cat(sprintf("player directory: %d rows (%d with a team, %d defenses)\n", nrow(out), sum(!is.na(out$team)), nrow(defs)))
