# Usage / efficiency profile for every QB, RB, WR and TE ranked this week (display only -- nothing here feeds a projection).
# Fills the "Usage vs. the pool" panel of Weekly Projection Rankings (and the Touchdown profile panel for WR / TE) with the numbers
# that describe how a player is used and how well he uses it. Published as kind "usage_profile" through the same player_groups
# table + publisher as the other groupings (no new table).
#
# Source: nflreadr::load_player_stats() (nflverse weekly player stats: passing / rushing / receiving volume, EPA, CPOE, air yards,
# target and air-yards share). Every number is recency-weighted over the player's last UP_WIN (17, a full season) regular-season games (half-life
# UP_HL games, the same weighting td_profile.R uses): per-game numbers are weighted means, rates are weighted sums over weighted sums
# (yards per attempt = sum(w * yards) / sum(w * attempts)), so a big game doesn't distort a rate.
#
#   QB  att_pg  pass attempts a game      ypa     yards per attempt      aypa    air yards per attempt
#       cpoe    completion % over expected (attempt-weighted)           epa_db  EPA per dropback (attempts + sacks)
#       sack_rate  sacks / dropbacks, %    rush_ypg  rushing yards a game
#   RB  carries_pg  carries a game       rush_ypg   rushing yards a game  ypc  yards per carry
#       rush_epa  rushing EPA per carry  tgt_pg  targets a game           rec_ypg  receiving yards a game   touches_pg  carries + catches
#   WR / TE  tgt_pg  targets a game      tgt_share  share of team targets, %   air_share  share of team air yards, %
#       rec_ypg  receiving yards a game  ypt  yards per target            yac_rec  yards after the catch per catch   epa_tgt  EPA per target
#
# Rate numbers need real volume to mean anything (a backup with 3 carries): they are left out (NA -> the site shows no row) below
# QB 15 attempts a game, RB 5 carries a game, WR / TE 3 targets a game. Players with fewer than UP_MIN_GAMES games get no profile.
#
# Called from player_groups.R (weekly, after projection_engine.R); also runs on its own: `Rscript usage_profile.R` replaces just the
# usage_profile rows in upload_player_groups.csv. Needs the current season's rankings for the pool.
suppressMessages(library(nflreadr))

UP_WIN <- 17
UP_HL  <- 8
UP_MIN_GAMES <- 6
UP_GATE <- c(QB = 15, RB = 5, WR = 3, TE = 3)   # volume a game below which the rate numbers are left out
up_name_key <- function(x) gsub("[^a-z]", "", tolower(gsub("\\b(jr|sr|ii|iii|iv|v)\\b\\.?", "", x, ignore.case = TRUE)))

# x: the player's last games, oldest first. Returns a named list of metrics (NA where not defined / below the gate).
up_metrics <- function(x, pos) {
  n <- nrow(x); w <- 0.5^(((n - 1):0) / UP_HL)
  num <- function(v) { v[is.na(v)] <- 0; v }
  per_game <- function(v) sum(w * num(v)) / sum(w)
  ratio <- function(a, b) { d <- sum(w * num(b)); if (d > 0) sum(w * num(a)) / d else NA_real_ }
  wmean <- function(v, wt = w) { ok <- !is.na(v) & !is.na(wt); if (!any(ok) || sum(wt[ok]) <= 0) NA_real_ else sum(wt[ok] * v[ok]) / sum(wt[ok]) }
  r <- function(v, d = 2) if (is.finite(v)) round(v, d) else NA_real_
  out <- list()
  if (pos == "QB") {
    att <- per_game(x$attempts)
    out$att_pg <- r(att, 1)
    if (att >= UP_GATE[["QB"]]) {
      out$ypa <- r(ratio(x$passing_yards, x$attempts))
      out$aypa <- r(ratio(x$passing_air_yards, x$attempts))
      out$cpoe <- r(wmean(x$passing_cpoe, w * num(x$attempts)))
      out$epa_db <- r(ratio(x$passing_epa, num(x$attempts) + num(x$sacks_suffered)), 3)
      out$sack_rate <- r(100 * ratio(x$sacks_suffered, num(x$attempts) + num(x$sacks_suffered)), 1)
    }
    out$rush_ypg <- r(per_game(x$rushing_yards), 1)
  } else if (pos == "RB") {
    car <- per_game(x$carries)
    out$carries_pg <- r(car, 1)
    out$rush_ypg <- r(per_game(x$rushing_yards), 1)
    if (car >= UP_GATE[["RB"]]) {
      out$ypc <- r(ratio(x$rushing_yards, x$carries))
      out$rush_epa <- r(ratio(x$rushing_epa, x$carries), 3)
    }
    out$tgt_pg <- r(per_game(x$targets), 1)
    out$rec_ypg <- r(per_game(x$receiving_yards), 1)
    out$touches_pg <- r(per_game(num(x$carries) + num(x$receptions)), 1)
  } else {
    tgt <- per_game(x$targets)
    out$tgt_pg <- r(tgt, 1)
    out$rec_ypg <- r(per_game(x$receiving_yards), 1)
    if (tgt >= UP_GATE[[pos]]) {
      out$tgt_share <- r(100 * wmean(x$target_share), 1)
      out$air_share <- r(100 * wmean(x$air_yards_share), 1)
      out$ypt <- r(ratio(x$receiving_yards, x$targets))
      out$yac_rec <- r(ratio(x$receiving_yards_after_catch, x$receptions))
      out$epa_tgt <- r(ratio(x$receiving_epa, x$targets), 3)
    }
  }
  out
}

usage_profile_rows <- function(pool, season, week) {
  pool <- pool[pool$position %in% c("QB", "RB", "WR", "TE"), c("player_name", "position")]
  pool$k <- up_name_key(pool$player_name)
  st <- as.data.frame(load_player_stats((season - 2):season))
  st <- st[st$season_type == "REG" & st$position %in% c("QB", "RB", "WR", "TE"), ]
  st$k <- up_name_key(st$player_display_name)
  st <- st[order(st$player_id, st$season, st$week), ]

  out <- list()
  for (r in seq_len(nrow(pool))) {
    cand <- st[st$k == pool$k[r] & st$position == pool$position[r], ]
    if (!nrow(cand)) next
    id <- cand$player_id[which.max(cand$season * 100 + cand$week)]     # the most recent player carrying this name
    x <- tail(st[st$player_id == id, ], UP_WIN)
    if (nrow(x) < UP_MIN_GAMES) next
    m <- up_metrics(x, pool$position[r])
    m <- m[!vapply(m, function(v) is.na(v), logical(1))]
    if (!length(m)) next
    out[[length(out) + 1]] <- data.frame(
      season = season, week = week, player_name = pool$player_name[r], position = pool$position[r], kind = "usage_profile",
      label = sprintf("%d games", nrow(x)),
      detail = as.character(jsonlite::toJSON(c(list(games = nrow(x)), m), auto_unbox = TRUE)),
      stringsAsFactors = FALSE)
  }
  do.call(rbind, out)
}

if (sys.nframe() == 0) {
  library(jsonlite)
  # Optional first argument: a CSV of the pool (player_name, position, season, week); default is the rankings file the weekly run just wrote.
  args <- commandArgs(trailingOnly = TRUE)
  rk <- read.csv(if (length(args)) args[1] else "upload_redraft_rankings.csv", stringsAsFactors = FALSE)
  season <- rk$season[1]; week <- rk$week[1]
  res <- usage_profile_rows(unique(rk[, c("player_name", "position")]), season, week)
  cat(sprintf("usage_profile: %d rows (season %s, week %s)\n", nrow(res), season, week))
  print(table(res$position))
  # replace only the usage_profile rows of the groups file, keeping everything else in it
  f <- "upload_player_groups.csv"
  old <- if (file.exists(f)) read.csv(f, stringsAsFactors = FALSE) else NULL
  if (!is.null(old)) { old <- old[old$kind != "usage_profile" & old$season == season & old$week == week, ]; res <- rbind(old[, names(res)], res) }
  write.csv(res, f, row.names = FALSE)
  cat(sprintf("Wrote %s: %d rows\n", f, nrow(res)))
}
