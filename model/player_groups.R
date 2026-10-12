# Extra player groupings, assigned weekly for everyone in the current Player Sims pool:
#
#   sustainability  Running Hot / In Line / Running Cold -- actual fantasy points per game vs the points his
#                   opportunity says he should have scored (expected points, xFP), over the last two seasons,
#                   adjusted for each position's baseline. Flagged only when the gap is >= 1 point a game AND
#                   statistically meaningful (z >= 1). Backtested on 2025: players flagged hot fell ~3.2
#                   points/game in the next window, cold rose ~1.7-2.2, and next-window production landed
#                   within ~0.3 points of expected. The gap itself is NOT repeatable (half-to-half correlation
#                   ~0), so this is a regression signal, not a skill label.
#   career_stage    Ascending / Prime / Decline Watch / Late Career (QB: Ascending / Prime / Veteran), from
#                   age as of Sept 1 with per-position cutoffs taken from the longitudinal age curves in the
#                   README ("Age curves -- longitudinal").
#   td_profile      WR and TE only, for everyone ranked on Weekly Projection Rankings (td_profile.R): expected TDs per
#                   game, chance of 2+ TD in a game, inside-10 targets per game and share. Display only.
#
# Run: Rscript player_groups.R   (after projection_engine.R; reads upload_player_simulations.csv for the pool and
# season/week, and upload_player_game_log.csv for actual vs expected points). Writes upload_player_groups.csv.
# Publish with: node --env-file=.env.local scripts/publish-player-groups.mjs
suppressMessages({ library(jsonlite); source("player_meta.R"); source("td_profile.R") })

SUSTAIN_MIN_GAMES <- 8       # games with expected-points data
SUSTAIN_MIN_GAP   <- 1.0     # points per game, vs the position baseline
SUSTAIN_MIN_Z     <- 1.0

# highest WHOLE-YEAR age (as of Sept 1) that still counts as Ascending / Prime / Decline Watch; older = Late Career
STAGE_CUTS <- list(RB = c(23, 26, 28), WR = c(24, 27, 29), TE = c(25, 29, 31), QB = c(24, 35, Inf))
career_stage_label <- function(pos, age) {
  a <- floor(age); c <- STAGE_CUTS[[pos]]
  if (a <= c[1]) "Ascending" else if (a <= c[2]) "Prime" else if (a <= c[3]) { if (pos == "QB") "Veteran" else "Decline Watch" } else "Late Career"
}

name_key <- function(x) gsub("[^a-z]", "", tolower(gsub("\\b(jr|sr|ii|iii|iv|v)\\b\\.?", "", x, ignore.case = TRUE)))

sustainability_rows <- function(pool, season, week) {
  g <- read.csv("upload_player_game_log.csv", stringsAsFactors = FALSE)
  g <- g[g$player_name %in% pool$player_name & !is.na(g$exp_points_ppr) & !is.na(g$fantasy_points_ppr), ]
  g$gap <- g$fantasy_points_ppr - g$exp_points_ppr
  per <- do.call(rbind, lapply(split(g, g$player_name), function(x) data.frame(
    player_name = x$player_name[1], games = nrow(x), fp_pg = mean(x$fantasy_points_ppr), xfp_pg = mean(x$exp_points_ppr),
    gap = mean(x$gap), sd = sqrt(mean((x$gap - mean(x$gap))^2)), stringsAsFactors = FALSE)))
  per <- per[per$games >= SUSTAIN_MIN_GAMES, ]
  per$position <- pool$position[match(per$player_name, pool$player_name)]
  base <- tapply(per$gap, per$position, mean)                 # each position's own average gap
  per$adj <- per$gap - base[per$position]
  per$z <- per$adj / (pmax(per$sd, 1e-6) / sqrt(per$games))
  per$label <- ifelse(per$z >= SUSTAIN_MIN_Z & per$adj >= SUSTAIN_MIN_GAP, "Running Hot",
                ifelse(per$z <= -SUSTAIN_MIN_Z & per$adj <= -SUSTAIN_MIN_GAP, "Running Cold", "In Line"))
  data.frame(season = season, week = week, player_name = per$player_name, position = per$position, kind = "sustainability", label = per$label,
             detail = mapply(function(a, b, c, d, e) as.character(toJSON(list(games = a, fp_pg = round(b, 1), xfp_pg = round(c, 1), gap_pg = round(d, 1), z = round(e, 1)), auto_unbox = TRUE)),
                             per$games, per$fp_pg, per$xfp_pg, per$adj, per$z),
             stringsAsFactors = FALSE)
}

career_stage_rows <- function(pool, season, week) {
  m <- player_meta(season); m <- m[!is.na(m$age), ]
  m$k <- name_key(m$full_name); p <- pool; p$k <- name_key(p$player_name)
  j <- merge(p, m[!duplicated(m$k), c("k", "age", "years_exp")], by = "k")
  if (nrow(j) < nrow(p)) cat("career_stage: no roster age for", nrow(p) - nrow(j), "pool players (skipped)\n")
  data.frame(season = season, week = week, player_name = j$player_name, position = j$position, kind = "career_stage",
             label = mapply(career_stage_label, j$position, j$age),
             detail = mapply(function(a, b) as.character(toJSON(list(age = a, years_exp = b), auto_unbox = TRUE)), floor(j$age), j$years_exp),
             stringsAsFactors = FALSE)
}

if (sys.nframe() == 0) {
  sims <- read.csv("upload_player_simulations.csv", stringsAsFactors = FALSE)
  season <- sims$season[1]; week <- sims$week[1]
  pool <- unique(sims[sims$position %in% c("QB", "RB", "WR", "TE"), c("player_name", "position")])
  out <- rbind(sustainability_rows(pool, season, week), career_stage_rows(pool, season, week))
  # td_profile covers the whole weekly ranking (more players than the sims pool); never fatal
  rk <- tryCatch(read.csv("upload_redraft_rankings.csv", stringsAsFactors = FALSE), error = function(e) NULL)
  if (!is.null(rk)) {
    td <- tryCatch(td_profile_rows(unique(rk[, c("player_name", "position")]), rk$season[1], rk$week[1]), error = function(e) { cat("td_profile skipped:", conditionMessage(e), "\n"); NULL })
    if (!is.null(td) && nrow(td)) out <- rbind(out, td)
  }
  write.csv(out, "upload_player_groups.csv", row.names = FALSE)
  cat(sprintf("Wrote upload_player_groups.csv: %d rows (season %s, week %s)\n", nrow(out), season, week))
  print(table(out$kind, out$label))
}
