# Dynasty value: the inputs the website's Dynasty Draft Board turns into a ranking.
#   Rscript dynasty_age_value.R && Rscript dynasty_production_value.R && Rscript dynasty_value.R
#
# Writes dynasty_value.csv and ../web/data/dynasty-values.json (what the board reads), one row per player with
# a recency-weighted PPG and enough games, carrying everything the page needs to score him both ways:
#   - production over replacement, 1-10, for each LEAGUE FORMAT: his weighted PPG minus the replacement-level
#     player at his position, on one scale shared by all positions (1 = replacement, 10 = V_HI points a game over it;
#     below replacement it keeps going below 1, it is not floored).
#     Replacement = the player ranked just past the starters a 12-team league needs (REPL_RANK), averaged over
#     the end of each season REPL_FROM..2025 so it does not move week to week: 1QB: QB12; superflex: QB24 (Nov 3 2026, founder; was QB32,
#     then QB25, QB30 and QB28 for a few minutes -- mid-range QBs had ranked above elite WRs); both: RB29, WR42, TE13 (1QB / 2RB / 3WR / 1TE / 1FLEX).
#   - age value, 1-10, on the scale shared by all positions (dynasty_age_value.R, `age_value_cross`).
#   - sd_prod: how many production-score points the production number misses by next season (the out-of-sample
#     RMSE of next-season PPG at his position from backtest_production_window.R, in score units). The site uses it
#     for the range bars and for tiers: two players are tied when each is about as likely to beat the other as not.
# The CONTENDER / REBUILDER weights (production : age) live on the site (web/lib/dynastyBoard.js).

suppressMessages(library(nflreadr))
suppressMessages(library(jsonlite))
source("dynasty_params.R")   # WINDOW, HALF_LIFE

POSITIONS <- c("QB", "RB", "WR", "TE")
REPL_RANK <- list(`1QB` = c(QB = 12, RB = 29, WR = 42, TE = 13), SF = c(QB = 24, RB = 29, WR = 42, TE = 13))
REPL_FROM <- 2018
V_HI      <- 15
KEEP      <- 450   # players shipped (founder, Nov 16 2026: rank at least 300); the page shows the top 300 overall and the top 120 of a position
                   # (every format / mode reorders the pool, so it ships more than it shows)
AGE_DATE  <- as.Date("2026-09-01")

prod <- read.csv("dynasty_production_value.csv")
ref  <- read.csv("dynasty_production_reference.csv")
prod_s <- read.csv("dynasty_production_value_short.csv")        # the Rebuilder's 17-game / half-life 8 number (see dynasty_params.R)
ref_s  <- read.csv("dynasty_production_reference_short.csv")
agev <- read.csv("dynasty_age_value.csv")
bt   <- readRDS("backtest_production_window_results.rds")   # same window / half-life as dynasty_production_value.R

# replacement PPG: the weighted PPG at that rank in each season's pool, averaged over seasons
replacement_ppg <- function(ref) sapply(names(REPL_RANK), function(f) sapply(POSITIONS, function(p) {
  r <- REPL_RANK[[f]][[p]]
  mean(sapply(unique(ref$season[ref$season >= REPL_FROM]), function(s) {
    x <- sort(ref$ppg[ref$position == p & ref$season == s], decreasing = TRUE)
    x[min(r, length(x))]
  }))
}))
repl   <- replacement_ppg(ref)     # Contender: 34-game memory
repl_s <- replacement_ppg(ref_s)   # Rebuilder: 17-game memory
cat("replacement PPG (34 games, Contender):\n"); print(round(repl, 2))
cat("replacement PPG (17 games, Rebuilder):\n"); print(round(repl_s, 2))

rmse <- sapply(POSITIONS, function(p) bt$rmse_y1[bt$position == p & bt$window == WINDOW & bt$half_life == HALF_LIFE])
sd_prod <- 9 / V_HI * rmse
rmse_s <- sapply(POSITIONS, function(p) bt$rmse_y1[bt$position == p & bt$window == WINDOW_SHORT & bt$half_life == HALF_LIFE_SHORT])
sd_prod_s <- 9 / V_HI * rmse_s

ros <- as.data.frame(load_rosters(as.integer(format(AGE_DATE, "%Y"))))
ros <- ros[!duplicated(ros$gsis_id), c("gsis_id", "birth_date")]
d <- merge(prod, ros, by.x = "player_id", by.y = "gsis_id")
d <- d[!d$thin & !is.na(d$birth_date), ]
# the Rebuilder's 17-game number; a player without one (fewer than 6 games in his last 17) keeps the 34-game number
d <- merge(d, prod_s[, c("player_id", "ppg_weighted", "games_in_window")], by = "player_id", all.x = TRUE, suffixes = c("", "_s"))
d$ppg_s   <- ifelse(is.na(d$ppg_weighted_s), d$ppg_weighted, d$ppg_weighted_s)
d$games_s <- ifelse(is.na(d$games_in_window_s), d$games_in_window, d$games_in_window_s)
d$age <- round(as.numeric(AGE_DATE - as.Date(d$birth_date)) / 365.25, 1)
d$age_value <- mapply(function(p, a) {
  t <- agev[agev$position == p, ]
  round(approx(t$age, t$age_value_cross, xout = min(max(a, min(t$age)), max(t$age)))$y, 2)
}, d$position, d$age)
# NOT clipped: a player below replacement is worth LESS than replacement, so his production score goes below 1 (a floor at 1
# had let a 1.7 PPG rookie and a 6 PPG backup tie, and then his age decided the order)
por <- function(f) round(1 + 9 * (d$ppg_weighted - repl[cbind(d$position, f)]) / V_HI, 2)
d$por_1qb <- por("1QB"); d$por_sf <- por("SF")
d$sd_prod <- round(sd_prod[d$position], 2)
por_s <- function(f) round(1 + 9 * (d$ppg_s - repl_s[cbind(d$position, f)]) / V_HI, 2)
d$por_1qb_s <- por_s("1QB"); d$por_sf_s <- por_s("SF")
d$sd_prod_s <- round(sd_prod_s[d$position], 2)

# who drafted him and when (nflverse load_players; franchise codes already current, e.g. LV for an Oakland pick). Undrafted = "" / 0.
# The site works out "is the GM who drafted him still running that team" from these and web/lib/teamStaff.js.
dr <- as.data.frame(load_players())[, c("gsis_id", "draft_team", "draft_year")]
dr <- dr[!duplicated(dr$gsis_id), ]
d <- merge(d, dr, by.x = "player_id", by.y = "gsis_id", all.x = TRUE)
d$draft_team <- ifelse(is.na(d$draft_team), "", d$draft_team)
d$draft_year <- ifelse(is.na(d$draft_year), 0L, as.integer(d$draft_year))

# When a player who LEFT his drafting team joined the team he plays for now: the start of his current stint on that team in the
# weekly rosters (2016 on; a stint starting in week 1 = that offseason, dated March 15), refined to the trade date when nflverse has
# the trade (load_trades -- an offseason trade can fall any time up to the season, so the window runs to Sept 15 for a week-1 stint -- which ends Aug 2025 -- later trades fall back to the roster date). acq_how: "trade" or "joined" (a
# signing, or a trade nflverse doesn't list). The site compares acq_date with the current GM's start (web/lib/teamStaff.js).
moved <- d$player_id[d$draft_team != "" & d$draft_team != d$team]
rw <- as.data.frame(load_rosters_weekly(2016:as.integer(format(AGE_DATE, "%Y"))))[, c("gsis_id", "pfr_id", "season", "week", "team")]
rw <- rw[rw$gsis_id %in% moved, ]
rw <- rw[order(rw$gsis_id, -rw$season, -rw$week), ]
tr <- as.data.frame(load_trades())
tr <- tr[!is.na(tr$pfr_id), c("trade_date", "received", "pfr_id")]
acq <- do.call(rbind, lapply(split(rw, rw$gsis_id), function(x) {
  cur <- d$team[d$player_id == x$gsis_id[1]][1]
  run <- cumprod(x$team == cur) == 1
  if (!any(run)) return(NULL)
  s <- x[max(which(run)), ]
  date <- if (s$week <= 1) as.Date(sprintf("%d-03-15", s$season)) else as.Date(sprintf("%d-09-05", s$season)) + 7 * (s$week - 1)
  pf <- x$pfr_id[!is.na(x$pfr_id)][1]
  t <- tr[!is.na(pf) & tr$pfr_id == pf & tr$received == cur & tr$trade_date >= date - 300 & tr$trade_date <= (if (s$week <= 1) as.Date(sprintf("%d-09-15", s$season)) else date + 30), ]
  if (nrow(t)) data.frame(player_id = x$gsis_id[1], acq_date = format(max(t$trade_date)), acq_how = "trade")
  else data.frame(player_id = x$gsis_id[1], acq_date = format(date), acq_how = "joined")
}))
d <- merge(d, acq, by = "player_id", all.x = TRUE)
d$acq_date <- ifelse(is.na(d$acq_date), "", d$acq_date)
d$acq_how  <- ifelse(is.na(d$acq_how), "", d$acq_how)

# keep the board to the players who can matter: the top KEEP by his best score under any format / mode
d$best <- pmax(0.8 * pmax(d$por_1qb, d$por_sf) + 0.2 * d$age_value, 0.5 * pmax(d$por_1qb_s, d$por_sf_s) + 0.5 * d$age_value)
d <- d[order(-d$best), ][seq_len(min(KEEP, nrow(d))), ]
# each player's regular-season games, oldest first (the drift below and the profile's timeline)
g <- as.data.frame(load_player_stats((as.integer(format(AGE_DATE, "%Y")) - 4):as.integer(format(AGE_DATE, "%Y"))))
g <- g[g$season_type == "REG" & !is.na(g$fantasy_points_ppr) & !is.na(g$player_id) & g$player_id %in% d$player_id, ]
g <- g[order(g$player_id, g$season, g$week), ]

# Drift: how far his weighted PPG has moved over his last DRIFT games (the number now minus the same number DRIFT games ago),
# for both windows. The board turns it into dynasty-score points (x 9 / V_HI x the mode's production weight x the board scale),
# so it is the change in his score from production alone, age held. Both ends read the same game source, so they compare.
DRIFT <- 9
wppg <- function(pts, hl) { w <- 0.5^((rev(seq_along(pts)) - 1) / hl); sum(w * pts) / sum(w) }
drift <- function(p, win, hl) {
  if (length(p) < DRIFT + 4) return(NA_real_)
  round(wppg(tail(p, win), hl) - wppg(tail(head(p, length(p) - DRIFT), win), hl), 2)
}
gp <- split(g$fantasy_points_ppr, g$player_id)
d$drift   <- vapply(d$player_id, function(id) drift(gp[[id]], WINDOW, HALF_LIFE), 0)
d$drift_s <- vapply(d$player_id, function(id) drift(gp[[id]], WINDOW_SHORT, HALF_LIFE_SHORT), 0)

out <- d[order(-d$por_sf), c("player_id", "player", "position", "team", "age", "games_in_window", "ppg_weighted",
                              "age_value", "por_1qb", "por_sf", "sd_prod", "ppg_s", "games_s", "por_1qb_s", "por_sf_s", "sd_prod_s",
                              "draft_team", "draft_year", "acq_date", "acq_how", "drift", "drift_s")]
write.csv(out, "dynasty_value.csv", row.names = FALSE)

# the site's data file: rows as a compact array, plus what the player profile draws
q <- function(x) if (length(x) == 1 && is.na(x)) "null" else if (is.character(x)) paste0('"', gsub('"', '\\\\"', x), '"') else format(x, trim = TRUE)
rows <- vapply(seq_len(nrow(out)), function(i) paste0("[", paste(vapply(out[i, ], q, ""), collapse = ","), "]"), "")
meta <- toJSON(list(
  built = format(Sys.Date()),
  window = list(games = WINDOW, half_life = HALF_LIFE),
  window_short = list(games = WINDOW_SHORT, half_life = HALF_LIFE_SHORT),
  drift_games = DRIFT,
  v_hi = V_HI,
  replacement = lapply(setNames(colnames(repl), colnames(repl)), function(f) setNames(as.list(round(repl[, f], 2)), rownames(repl))),
  replacement_short = lapply(setNames(colnames(repl_s), colnames(repl_s)), function(f) setNames(as.list(round(repl_s[, f], 2)), rownames(repl_s))),
  age_curve = lapply(setNames(POSITIONS, POSITIONS), function(p) { t <- agev[agev$position == p & agev$age <= 40, ]
    unname(Map(function(a, v, r) c(a, round(v, 1), round(r, 3)), t$age, t$age_value_cross, t$retained_smooth)) })
), auto_unbox = TRUE, digits = NA)
meta <- sub("^\\{", "", meta); meta <- sub("\\}$", "", meta)
json <- sprintf('{%s,"columns":[%s],"rows":[\n%s\n]}\n', meta, paste0('"', names(out), '"', collapse = ","), paste(rows, collapse = ",\n"))
dir.create("../web/data", showWarnings = FALSE)
writeLines(json, "../web/data/dynasty-values.json")

# each player's last WINDOW games (season x 100 + week, points): the profile's production timeline. Read on demand by
# /api/dynasty-profile, never shipped with the page.
logs <- lapply(split(g, g$player_id), function(d) { d <- tail(d, WINDOW); list(w = d$season * 100 + d$week, p = round(d$fantasy_points_ppr, 1)) })
write(toJSON(logs, auto_unbox = FALSE, digits = NA), "../web/data/dynasty-logs.json")
cat("wrote dynasty_value.csv, ../web/data/dynasty-values.json and dynasty-logs.json:", nrow(out), "players\n")
