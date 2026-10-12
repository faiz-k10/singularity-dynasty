# Touchdown profile for every WR and TE ranked this week (display only -- nothing here feeds a projection).
# Shown in the "Touchdown profile" panel of Weekly Projection Rankings; published as kind "td_profile" through the same
# player_groups table + publisher as the other groupings (no new table).
#
#   xtd_pg     expected touchdowns per game: ffopportunity's expected TDs (how likely each touch was to score, from
#              its field position), recency-weighted over his last 24 games (half-life 8 games)
#   p2         chance of 2+ touchdowns in a game: a Poisson-shaped curve of xtd_pg (1 - e^-L (1+L), L = a*xtd^b) fitted per
#              position on 2018 through last season (the same weighting, using only games before each one). Leave-
#              one-season-out: AUC ~0.76 for WR and TE and calibrated across the range (e.g. WR predicted 7.5% /
#              11.3% vs actual 8.4% / 8.9% in the 6-10% and 10-15% bands). A WR at 0.84 expected TDs a game reads ~13%.
#   i10_pg     targets per game from inside the 10-yard line, same weighting
#   i10_share  share of his targets that came from inside the 10, same weighting
#   tgt_pg / tgt_games  targets per game and games played since the start of last season (regular season)
#
# Deliberately NOT used: touchdown conversion rate on goal-line targets and the player's own past 2+ TD games.
# Tested on 2021-25: neither adds anything once role is known (conversion rate ~0.1 correlation with future
# touchdowns; finishing above expectation does not persist, r ~0.01).
#
# Windows use regular-season games only (expected TDs and targets alike).
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
td_p2 <- function(par, x) { L <- exp(par[1]) * x^par[2]; 1 - exp(-L) * (1 + L) }
td_name_key <- function(x) gsub("[^a-z]", "", tolower(gsub("\\b(jr|sr|ii|iii|iv|v)\\b\\.?", "", x, ignore.case = TRUE)))

td_profile_rows <- function(pool, season, week) {
  pool <- pool[pool$position %in% c("WR", "TE"), c("player_name", "position")]
  pool$k <- td_name_key(pool$player_name)

  # expected TDs per player-game, 2018 on
  ffo <- as.data.frame(load_ff_opportunity(2018:season, stat_type = "weekly"))
  # Regular season only (weeks 1-18): the feed also carries playoff games, which only some teams play and which would
  # make one player's 24-game window reach further back than another's.
  ffo <- ffo[ffo$position %in% c("WR", "TE") & !is.na(ffo$week) & ffo$week <= 18, ]
  ffo <- ffo[order(ffo$player_id, ffo$season, ffo$week), ]
  ffo$td <- ffo$rush_touchdown + ffo$rec_touchdown
  ffo$xtd <- ffo$rush_touchdown_exp + ffo$rec_touchdown_exp
  ffo$two <- as.integer(ffo$td >= 2)
  ffo$pre <- NA_real_
  for (id in unique(ffo$player_id)) {
    i <- which(ffo$player_id == id); if (length(i) < TD_MIN_GAMES) next
    for (k in TD_MIN_GAMES:length(i)) ffo$pre[i[k]] <- td_wmean(ffo$xtd[i[max(1, k - TD_WIN):(k - 1)]])
  }
  # P(2+ TDs) = 1 - exp(-L) * (1 + L) with L = a * xtd^b (a Poisson-shaped curve; a and b fitted per position on
  # completed seasons only, using each game's pre-game xtd). Replaced a logistic that overstated the top end
  # (players it put at 15-20%+ actually hit ~13% / ~11%); this curve is calibrated across the range.
  fits <- lapply(c(WR = "WR", TE = "TE"), function(ps) {
    d <- ffo[ffo$position == ps & !is.na(ffo$pre) & ffo$pre > 0 & ffo$season < season, ]
    nll <- function(par) { p <- pmin(pmax(td_p2(par, d$pre), 1e-6), 1 - 1e-6); -sum(d$two * log(p) + (1 - d$two) * log(1 - p)) }
    optim(c(log(0.5), 1.5), nll)$par
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
    p2 <- 100 * td_p2(fits[[pool$position[r]]], xtd)
    # Volume since the start of last season (regular-season games he played): feeds the "qualifies for the In-10
    # Share ranking" rule on the site (3+ targets a game, 6+ games) so a backup with two goal-line targets can't
    # top a share leaderboard.
    sx <- st[st$player_id == id & st$season >= season - 1, ]
    n <- nrow(x); wt <- 0.5^(((n - 1):0) / TD_HL)
    i10_pg <- sum(wt * x$i10) / sum(wt)
    share <- if (sum(wt * x$targets) > 0) 100 * sum(wt * x$i10) / sum(wt * x$targets) else 0
    out[[length(out) + 1]] <- data.frame(
      season = season, week = week, player_name = pool$player_name[r], position = pool$position[r], kind = "td_profile",
      label = sprintf("%.1f%% chance of 2+ TDs", p2),
      detail = as.character(jsonlite::toJSON(list(games = n, xtd_pg = round(xtd, 2), p2 = round(p2, 1), i10_pg = round(i10_pg, 2), i10_share = round(share, 1), tgt_pg = round(mean(sx$targets, na.rm = TRUE), 2), tgt_games = nrow(sx)), auto_unbox = TRUE)),
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
