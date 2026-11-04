# Dynasty value: the inputs the website's Dynasty Draft Board turns into a ranking.
#   Rscript dynasty_age_value.R && Rscript dynasty_production_value.R && Rscript dynasty_value.R
#
# Writes dynasty_value.csv and ../web/data/dynasty-values.json (what the board reads), one row per player with
# a recency-weighted PPG and enough games, carrying everything the page needs to score him both ways:
#   - production over replacement, 1-10, for each LEAGUE FORMAT: his weighted PPG minus the replacement-level
#     player at his position, on one scale shared by all positions (1 = replacement, 10 = V_HI points a game over it;
#     below replacement it keeps going below 1, it is not floored).
#     Replacement = the player ranked just past the starters a 12-team league needs (REPL_RANK), averaged over
#     the end of each season REPL_FROM..2025 so it does not move week to week: 1QB: QB12; superflex: QB25 (the first QB past
#     the 24 a 12-team superflex league starts; was QB32 from Oct 28 until Nov 3 2026, when mid-range QBs ranked above elite WRs); both: RB29, WR42, TE13 (1QB / 2RB / 3WR / 1TE / 1FLEX).
#   - age value, 1-10, on the scale shared by all positions (dynasty_age_value.R, `age_value_cross`).
#   - sd_prod: how many production-score points the production number misses by next season (the out-of-sample
#     RMSE of next-season PPG at his position from backtest_production_window.R, in score units). The site uses it
#     for the range bars and for tiers: two players are tied when each is about as likely to beat the other as not.
# The CONTENDER / REBUILDER weights (production : age) live on the site (web/lib/dynastyBoard.js).

suppressMessages(library(nflreadr))
suppressMessages(library(jsonlite))
source("dynasty_params.R")   # WINDOW, HALF_LIFE

POSITIONS <- c("QB", "RB", "WR", "TE")
REPL_RANK <- list(`1QB` = c(QB = 12, RB = 29, WR = 42, TE = 13), SF = c(QB = 25, RB = 29, WR = 42, TE = 13))
REPL_FROM <- 2018
V_HI      <- 15
KEEP      <- 250   # players shipped; the page shows the top 120 overall and the top 60 of a position (below that the
                   # numbers can't tell players apart: one big tier)
AGE_DATE  <- as.Date("2026-09-01")

prod <- read.csv("dynasty_production_value.csv")
ref  <- read.csv("dynasty_production_reference.csv")
agev <- read.csv("dynasty_age_value.csv")
bt   <- readRDS("backtest_production_window_results.rds")   # same window / half-life as dynasty_production_value.R

# replacement PPG: the weighted PPG at that rank in each season's pool, averaged over seasons
repl <- sapply(names(REPL_RANK), function(f) sapply(POSITIONS, function(p) {
  r <- REPL_RANK[[f]][[p]]
  mean(sapply(unique(ref$season[ref$season >= REPL_FROM]), function(s) {
    x <- sort(ref$ppg[ref$position == p & ref$season == s], decreasing = TRUE)
    x[min(r, length(x))]
  }))
}))
cat("replacement PPG:\n"); print(round(repl, 2))

rmse <- sapply(POSITIONS, function(p) bt$rmse_y1[bt$position == p & bt$window == WINDOW & bt$half_life == HALF_LIFE])
sd_prod <- 9 / V_HI * rmse

ros <- as.data.frame(load_rosters(as.integer(format(AGE_DATE, "%Y"))))
ros <- ros[!duplicated(ros$gsis_id), c("gsis_id", "birth_date")]
d <- merge(prod, ros, by.x = "player_id", by.y = "gsis_id")
d <- d[!d$thin & !is.na(d$birth_date), ]
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

# keep the board to the players who can matter: the top KEEP by his best score under any format / mode
d$best <- pmax(0.8 * pmax(d$por_1qb, d$por_sf) + 0.2 * d$age_value, 0.5 * pmax(d$por_1qb, d$por_sf) + 0.5 * d$age_value)
d <- d[order(-d$best), ][seq_len(min(KEEP, nrow(d))), ]
out <- d[order(-d$por_sf), c("player_id", "player", "position", "team", "age", "games_in_window", "ppg_weighted",
                              "age_value", "por_1qb", "por_sf", "sd_prod")]
write.csv(out, "dynasty_value.csv", row.names = FALSE)

# the site's data file: rows as a compact array, plus what the player profile draws
q <- function(x) if (is.character(x)) paste0('"', gsub('"', '\\\\"', x), '"') else format(x, trim = TRUE)
rows <- vapply(seq_len(nrow(out)), function(i) paste0("[", paste(vapply(out[i, ], q, ""), collapse = ","), "]"), "")
meta <- toJSON(list(
  built = format(Sys.Date()),
  window = list(games = WINDOW, half_life = HALF_LIFE),
  v_hi = V_HI,
  replacement = lapply(setNames(colnames(repl), colnames(repl)), function(f) setNames(as.list(round(repl[, f], 2)), rownames(repl))),
  age_curve = lapply(setNames(POSITIONS, POSITIONS), function(p) { t <- agev[agev$position == p & agev$age <= 40, ]
    unname(Map(function(a, v, r) c(a, round(v, 1), round(r, 3)), t$age, t$age_value_cross, t$retained_smooth)) })
), auto_unbox = TRUE, digits = NA)
meta <- sub("^\\{", "", meta); meta <- sub("\\}$", "", meta)
json <- sprintf('{%s,"columns":[%s],"rows":[\n%s\n]}\n', meta, paste0('"', names(out), '"', collapse = ","), paste(rows, collapse = ",\n"))
dir.create("../web/data", showWarnings = FALSE)
writeLines(json, "../web/data/dynasty-values.json")

# each player's last WINDOW games (season x 100 + week, points): the profile's production timeline. Read on demand by
# /api/dynasty-profile, never shipped with the page.
g <- as.data.frame(load_player_stats((as.integer(format(AGE_DATE, "%Y")) - 3):as.integer(format(AGE_DATE, "%Y"))))
g <- g[g$season_type == "REG" & !is.na(g$fantasy_points_ppr) & !is.na(g$player_id) & g$player_id %in% out$player_id, ]
g <- g[order(g$player_id, g$season, g$week), ]
logs <- lapply(split(g, g$player_id), function(d) { d <- tail(d, WINDOW); list(w = d$season * 100 + d$week, p = round(d$fantasy_points_ppr, 1)) })
write(toJSON(logs, auto_unbox = FALSE, digits = NA), "../web/data/dynasty-logs.json")
cat("wrote dynasty_value.csv, ../web/data/dynasty-values.json and dynasty-logs.json:", nrow(out), "players\n")
