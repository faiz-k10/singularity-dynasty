# Do the Dynasty Board's two context columns predict anything? (founder, Nov 16 2026: "do a backtest and see if anything turns up")
#   HC was OC   -- his head coach that season was once an NFL offensive coordinator
#   GM still there -- the GM who drafted / traded for / signed him still runs his team at the start of that season
# Unit: a player-season Y (2013-2025, 8+ games in Y and in Y-1). Baseline = what the board already uses, fit per position:
#   PPG in Y ~ recency-weighted PPG as of the end of Y-1 (34 games, half-life 17, dynasty_params.R) + age + age^2
# Then each flag is added (and both), scored by leave-one-season-out RMSE and by the flag's coefficient (points a game, with SE).
#   Rscript backtest_staff_context.R
suppressMessages(library(nflreadr))
source("dynasty_params.R")   # WINDOW, HALF_LIFE
SEASONS <- 2013:2025; POSITIONS <- c("QB", "RB", "WR", "TE"); MIN_GAMES <- 8

# ---- coaches who had been an NFL offensive coordinator (interim / co-OC counts) before that season. From public bios (Claude's
# knowledge, Nov 16 2026; not looked up one by one). Everyone else in load_schedules 2013-2026 is FALSE.
EX_OC <- c("Adam Gase", "Anthony Lynn", "Arthur Smith", "Ben Johnson", "Ben McAdoo", "Bill Callahan", "Bill O'Brien", "Brian Callahan",
  "Brian Daboll", "Brian Schottenheimer", "Bruce Arians", "Darrell Bevell", "Dave Canales", "Dirk Koetter", "Doug Marrone",
  "Doug Pederson", "Frank Reich", "Freddie Kitchens", "Gary Kubiak", "Hue Jackson", "Jason Garrett", "Jay Gruden", "Jim Caldwell",
  "Joe Brady", "Joe Philbin", "Jon Gruden", "Josh McDaniels", "Kellen Moore", "Ken Whisenhunt", "Kevin O'Connell", "Kevin Stefanski",
  "Klint Kubiak", "Kyle Shanahan", "Liam Coen", "Marc Trestman", "Matt LaFleur", "Matt Nagy", "Mike LaFleur", "Mike McCarthy",
  "Mike McCoy", "Mike McDaniel", "Mike Mularkey", "Mike Shanahan", "Nathaniel Hackett", "Nick Sirianni", "Pat Shurmur",
  "Rob Chudzinski", "Sean McVay", "Sean Payton", "Shane Steichen", "Todd Monken", "Zac Taylor")

# ---- who ran each team's roster, by start date (the regime at a date = the latest start on or before it). De facto lead where the
# title differs (Belichick, Jerry Jones, Tobin, O'Brien 2019-20, Allen / Rivera in WAS). Claude's knowledge, dates to the month.
GM <- list(
  ARI = c("2013-01-08", "2023-01-16"), ATL = c("2008-01-13", "2021-01-19", "2026-01-20"), BAL = c("2002-01-01", "2019-01-01"),
  BUF = c("2010-01-01", "2013-05-13", "2017-05-09"), CAR = c("2002-01-01", "2013-01-09", "2017-07-19", "2020-01-01", "2024-01-22"),
  CHI = c("2012-01-01", "2015-01-08", "2022-01-25"), CIN = c("2002-01-01"), CLE = c("2013-01-01", "2014-02-11", "2016-01-03", "2017-12-07", "2020-01-27"),
  DAL = c("1989-02-25"), DEN = c("2011-01-05", "2021-01-13"), DET = c("2008-01-01", "2016-01-09", "2021-01-14"), GB = c("2005-01-01", "2018-01-07"),
  HOU = c("2006-01-01", "2018-01-06", "2019-06-07", "2021-01-05"), IND = c("2012-01-11", "2017-01-29"), JAX = c("2013-01-08", "2021-01-21", "2025-02-04"),
  KC = c("2013-01-14", "2017-07-11"), LA = c("2012-02-10"), LAC = c("2013-01-09", "2024-01-29"),
  LV = c("2012-01-06", "2018-12-31", "2022-01-31", "2024-01-23", "2025-01-23"), MIA = c("2008-01-01", "2014-01-24", "2016-01-04", "2026-01-09"),
  MIN = c("2012-01-01", "2022-01-26", "2026-05-30"), NE = c("2000-01-27", "2024-01-17"), NO = c("2002-01-01"),
  NYG = c("2007-01-16", "2017-12-28", "2022-01-21"), NYJ = c("2013-01-18", "2015-01-13", "2019-06-07", "2025-01-23"), PHI = c("2010-01-29"),
  PIT = c("2000-01-01", "2022-05-24"), SEA = c("2010-01-19"), SF = c("2011-01-01", "2017-01-29"), TB = c("2009-01-01", "2014-01-21"),
  TEN = c("2012-01-01", "2016-01-14", "2023-01-17", "2025-01-16"), WAS = c("2010-01-01", "2015-01-07", "2017-03-09", "2020-01-01", "2024-01-11"))
regime <- function(team, date) { s <- GM[[team]]; if (is.null(s)) return(NA_integer_); sum(as.Date(s) <= date) }

# ---- player-seasons: weighted PPG as of the end of Y-1, age, PPG in Y, his team in Y (his first game)
ps <- as.data.frame(load_player_stats((min(SEASONS) - 3):max(SEASONS)))
ps <- ps[ps$season_type == "REG" & ps$position %in% POSITIONS & !is.na(ps$fantasy_points_ppr) & !is.na(ps$player_id), ]
ps <- ps[order(ps$player_id, ps$season, ps$week), ]
tcol <- if ("team" %in% names(ps)) "team" else "recent_team"
pl <- as.data.frame(load_players())[, c("gsis_id", "pfr_id", "birth_date", "draft_team", "draft_year")]
pl <- pl[!duplicated(pl$gsis_id), ]
sch <- as.data.frame(load_schedules(SEASONS)); sch <- sch[sch$game_type == "REG", ]
hc <- rbind(data.frame(season = sch$season, week = sch$week, team = sch$home_team, coach = sch$home_coach),
            data.frame(season = sch$season, week = sch$week, team = sch$away_team, coach = sch$away_coach))
hc <- hc[order(hc$season, hc$week), ]; hc <- hc[!duplicated(paste(hc$season, hc$team)), ]   # coach in the team's first game
rw <- as.data.frame(load_rosters_weekly((min(SEASONS) - 10):max(SEASONS)))[, c("gsis_id", "season", "week", "team")]
rw <- rw[!is.na(rw$gsis_id) & rw$gsis_id %in% unique(ps$player_id), ]
rw <- rw[order(rw$gsis_id, rw$season, rw$week), ]
rwb <- split(rw, rw$gsis_id)
tr <- as.data.frame(load_trades()); tr <- tr[!is.na(tr$pfr_id), c("trade_date", "received", "pfr_id")]
fix <- function(t) ifelse(t %in% c("STL", "LAR"), "LA", ifelse(t == "OAK", "LV", ifelse(t == "SD", "LAC", t)))

# when he joined the team he is on at the start of season Y: the start of that stint in the weekly rosters (week 1 = March 15 of that
# season), the trade date if nflverse lists it, or the draft (late April) when the stint begins with his rookie year on his drafting team
joined <- function(id, team, Y, pfr, dteam, dyear) {
  x <- rwb[[id]]; if (is.null(x)) return(as.Date(NA))
  x <- x[x$season < Y | (x$season == Y & x$week <= 1), ]; if (!nrow(x)) return(as.Date(NA))
  x$team <- fix(x$team); x <- x[nrow(x):1, ]
  run <- cumprod(x$team == team) == 1; if (!any(run)) return(as.Date(NA))
  s <- x[max(which(run)), ]
  if (!is.na(dyear) && fix(dteam) == team && s$season <= dyear) return(as.Date(sprintf("%d-04-25", dyear)))
  date <- if (s$week <= 1) as.Date(sprintf("%d-03-15", s$season)) else as.Date(sprintf("%d-09-05", s$season)) + 7 * (s$week - 1)
  t <- tr[!is.na(pfr) & tr$pfr_id == pfr & fix(tr$received) == team & tr$trade_date >= date - 300 &
          tr$trade_date <= (if (s$week <= 1) as.Date(sprintf("%d-09-15", s$season)) else date + 30), ]
  if (nrow(t)) max(t$trade_date) else date
}

rows <- list()
bp <- split(ps, ps$player_id)
for (id in names(bp)) {
  d <- bp[[id]]; info <- pl[pl$gsis_id == id, ]
  for (Y in SEASONS) {
    cur <- d[d$season == Y, ]; prev <- d[d$season < Y, ]
    if (nrow(cur) < MIN_GAMES || sum(prev$season == Y - 1) < MIN_GAMES) next
    p <- tail(prev$fantasy_points_ppr, WINDOW); w <- 0.5^((rev(seq_along(p)) - 1) / HALF_LIFE)
    team <- fix(cur[[tcol]][1]); start <- as.Date(sprintf("%d-09-01", Y))
    coach <- hc$coach[hc$season == Y & fix(hc$team) == team][1]
    j <- if (nrow(info)) joined(id, team, Y, info$pfr_id[1], info$draft_team[1], info$draft_year[1]) else as.Date(NA)
    rows[[length(rows) + 1]] <- data.frame(id = id, season = Y, pos = cur$position[1], team = team,
      x = sum(w * p) / sum(w), y = mean(cur$fantasy_points_ppr),
      age = if (nrow(info) && !is.na(info$birth_date[1])) as.numeric(start - as.Date(info$birth_date[1])) / 365.25 else NA,
      hc_oc = if (is.na(coach)) NA else coach %in% EX_OC,
      gm_there = if (is.na(j)) NA else regime(team, j) == regime(team, start),
      new_team = if (is.na(j)) NA else j > start - 365)
  }
}
B <- do.call(rbind, rows)
B <- B[!is.na(B$age) & !is.na(B$hc_oc) & !is.na(B$gm_there), ]
cat("player-seasons:", nrow(B), "| HC was OC:", round(mean(B$hc_oc) * 100), "% | GM still there:", round(mean(B$gm_there) * 100), "%\n\n")

loso <- function(f, D) { pred <- rep(NA_real_, nrow(D)); for (s in unique(D$season)) { tr <- D$season != s; m <- lm(f, D[tr, ]); pred[!tr] <- predict(m, D[!tr, ]) }; sqrt(mean((D$y - pred)^2)) }
base <- y ~ x + age + I(age^2)
out <- list()
for (pos in c(POSITIONS, "ALL")) {
  D <- if (pos == "ALL") B else B[B$pos == pos, ]
  fb <- if (pos == "ALL") update(base, . ~ . + pos) else base
  r0 <- loso(fb, D)
  for (v in c("hc_oc", "gm_there")) {
    f <- update(fb, as.formula(paste(". ~ . +", v)))
    m <- summary(lm(f, D))$coefficients; k <- grep(v, rownames(m))
    out[[length(out) + 1]] <- data.frame(pos = pos, flag = v, n = nrow(D), share = round(mean(D[[v]]), 2),
      coef = round(m[k, 1], 2), se = round(m[k, 2], 2), p = signif(m[k, 4], 2),
      rmse_base = round(r0, 3), rmse_with = round(loso(f, D), 3), change_pct = round(100 * (loso(f, D) / r0 - 1), 2))
  }
}
R <- do.call(rbind, out)
cat("Each flag added to the baseline (coef = points a game in season Y when the flag is TRUE, all else equal; change_pct < 0 = better)\n")
print(R, row.names = FALSE)

# the same, without the players who changed teams that offseason (GM still there is nearly always TRUE for them, and a new team is its own effect)
cat("\nGM still there, only players on the same team as last season:\n")
S <- B[!B$new_team, ]
for (pos in c(POSITIONS, "ALL")) {
  D <- if (pos == "ALL") S else S[S$pos == pos, ]
  f <- if (pos == "ALL") y ~ x + age + I(age^2) + pos + gm_there else y ~ x + age + I(age^2) + gm_there
  m <- summary(lm(f, D))$coefficients; k <- grep("gm_there", rownames(m))
  cat(sprintf("  %-4s n=%4d  share %.2f  coef %+.2f (se %.2f, p %.2g)\n", pos, nrow(D), mean(D$gm_there), m[k, 1], m[k, 2], m[k, 4]))
}
saveRDS(list(rows = B, results = R), "backtest_staff_context_results.rds")
