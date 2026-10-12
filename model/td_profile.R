# Touchdown profile for every WR and TE ranked this week (display only -- nothing here feeds a projection).
# Shown in the "Touchdown profile" panel of Weekly Projection Rankings; published as kind "td_profile" through the same
# player_groups table + publisher as the other groupings (no new table).
#
#   xtd_pg     expected touchdowns per game: ffopportunity's expected TDs (how likely each touch was to score, from
#              its field position), recency-weighted over his last 24 games (half-life 8 games)
#   p2         chance of 2+ touchdowns in a game: a logistic curve of xtd_pg fitted per position on 2018 through last
#              season (the same weighting, using only games before each one). Out-of-sample on 2025: AUC ~0.76
#              for WR and TE; the top WR band is overstated (predicted 12.9% vs 7.8% actual), so the order is more
#              trustworthy than the exact percentage at the very top.
#   i10_pg     targets per game from inside the 10-yard line, same weighting
#   i10_share  share of his targets that came from inside the 10, same weighting
#
# Deliberately NOT used: touchdown conversion rate on goal-line targets and the player's own past 2+ TD games.
# Tested on 2021-25: neither adds anything once role is known (conversion rate ~0.1 correlation with future
# touchdowns; finishing above expectation does not persist, r ~0.01).
#
# Called from player_groups.R (weekly, after projection_engine.R). Needs the current season's rankings for the pool.
suppressMessages(library(nflreadr))

TD_WIN <- 24         # games looked back
TD_HL  <- 8          # half-life in games
TD_MIN_GAMES <- 6    # fewer games than this -> no profile (the panel says so)

td_wmean <- function(x, w = NULL) {
  n <- length(x); wt <- 0.5^(((n - 1):0) / TD_HL)
  ok <- !is.na(x); if (!any(ok)) return(NA_real_)
  sum(wt[ok] * x[ok]) / sum(wt[ok])
}
td_name_key <- function(x) gsub("[^a-z]", "", tolower(gsub("\\b(jr|sr|ii|iii|iv|v)\\b\\.?", "", x, ignore.case = TRUE)))

td_profile_rows <- function(pool, season, week) {
  pool <- pool[pool$position %in% c("WR", "TE"), c("player_name", "position")]
  pool$k <- td_name_key(pool$player_name)

  # expected TDs per player-game, 2018 on
  ffo <- as.data.frame(load_ff_opportunity(2018:season, stat_type = "weekly"))
  ffo <- ffo[ffo$position %in% c("WR", "TE") & !is.na(ffo$week), ]
  ffo <- ffo[order(ffo$player_id, ffo$season, ffo$week), ]
  ffo$td <- ffo$rush_touchdown + ffo$rec_touchdown
  ffo$xtd <- ffo$rush_touchdown_exp + ffo$rec_touchdown_exp
  ffo$two <- as.integer(ffo$td >= 2)
  ffo$pre <- NA_real_
  for (id in unique(ffo$player_id)) {
    i <- which(ffo$player_id == id); if (length(i) < TD_MIN_GAMES) next
    for (k in TD_MIN_GAMES:length(i)) ffo$pre[i[k]] <- td_wmean(ffo$xtd[i[max(1, k - TD_WIN):(k - 1)]])
  }
  fits <- lapply(c(WR = "WR", TE = "TE"), function(ps) {
    d <- ffo[ffo$position == ps & !is.na(ffo$pre) & ffo$season < season, ]
    glm(two ~ pre, d, family = binomial)
  })

  # targets and inside-10 targets per player-game, the window's seasons
  seasons <- (season - 2):season
  st <- as.data.frame(load_player_stats(seasons)); st <- st[st$season_type == "REG" & st$position %in% c("WR", "TE"), ]
  pb <- as.data.frame(load_pbp(seasons))
  pb <- pb[which(pb$season_type == "REG" & pb$play_type == "pass" & !is.na(pb$receiver_player_id) & pb$two_point_attempt == 0 & pb$yardline_100 <= 10), ]
  pb$one <- 1
  i10 <- if (nrow(pb)) aggregate(one ~ receiver_player_id + season + week, pb, sum) else data.frame(receiver_player_id = character(), season = integer(), week = integer(), one = numeric())
  names(i10) <- c("player_id", "season", "week", "i10")
  g <- merge(st[, c("player_id", "player_display_name", "position", "season", "week", "targets")], i10, by = c("player_id", "season", "week"), all.x = TRUE)
  g$i10[is.na(g$i10)] <- 0
  g$k <- td_name_key(g$player_display_name)
  g <- g[order(g$player_id, g$season, g$week), ]

  out <- list()
  for (r in seq_len(nrow(pool))) {
    cand <- g[g$k == pool$k[r] & g$position == pool$position[r], ]
    if (!nrow(cand)) next
    id <- cand$player_id[which.max(cand$season * 100 + cand$week)]     # the most recent player carrying this name
    x <- tail(g[g$player_id == id, ], TD_WIN)
    f <- ffo[ffo$player_id == id, ]; f <- tail(f, TD_WIN)
    if (nrow(x) < TD_MIN_GAMES || nrow(f) < TD_MIN_GAMES) next
    xtd <- td_wmean(f$xtd)
    p2 <- 100 * predict(fits[[pool$position[r]]], data.frame(pre = xtd), type = "response")
    n <- nrow(x); wt <- 0.5^(((n - 1):0) / TD_HL)
    i10_pg <- sum(wt * x$i10) / sum(wt)
    share <- if (sum(wt * x$targets) > 0) 100 * sum(wt * x$i10) / sum(wt * x$targets) else 0
    out[[length(out) + 1]] <- data.frame(
      season = season, week = week, player_name = pool$player_name[r], position = pool$position[r], kind = "td_profile",
      label = sprintf("%.1f%% chance of 2+ TDs", p2),
      detail = as.character(jsonlite::toJSON(list(games = n, xtd_pg = round(xtd, 2), p2 = round(p2, 1), i10_pg = round(i10_pg, 2), i10_share = round(share, 1)), auto_unbox = TRUE)),
      stringsAsFactors = FALSE)
  }
  do.call(rbind, out)
}

if (sys.nframe() == 0) {
  library(jsonlite)
  rk <- read.csv("upload_redraft_rankings.csv", stringsAsFactors = FALSE)
  season <- rk$season[1]; week <- rk$week[1]
  res <- td_profile_rows(unique(rk[, c("player_name", "position")]), season, week)
  cat(sprintf("td_profile: %d rows (season %s, week %s)\n", nrow(res), season, week))
  print(head(res[order(-as.numeric(sub("%.*", "", sub("^", "", res$label)))), c("player_name", "position", "label", "detail")], 8), row.names = FALSE)
}
