# Dynasty value: the inputs the website's Dynasty Draft Board turns into a ranking.
#   Rscript dynasty_age_value.R && Rscript dynasty_production_value.R && Rscript dynasty_value.R
#
# Writes dynasty_value.csv and ../web/data/dynasty-values.json (what the board reads), one row per player with
# a recency-weighted PPG and enough games, carrying everything the page needs to score him both ways:
#   - production over replacement, 1-10, for each LEAGUE FORMAT: his weighted PPG minus the replacement-level
#     player at his position, on one scale shared by all positions (10 = V_HI points a game over replacement).
#     Replacement = the player ranked just past the starters a 12-team league needs (REPL_RANK), averaged over
#     the end of each season REPL_FROM..2025 so it does not move week to week: 1QB: QB12; superflex: QB32 (founder's
#     pick, Oct 28 2026, from a sweep of 24-44); both: RB29, WR42, TE13 (1QB / 2RB / 3WR / 1TE / 1FLEX).
#   - age value, 1-10, on the scale shared by all positions (dynasty_age_value.R, `age_value_cross`).
#   - sd_prod: how many production-score points the production number misses by next season (the out-of-sample
#     RMSE of next-season PPG at his position from backtest_production_blend.R, in score units). The site uses it
#     for the range bars and for tiers: two players are tied when each is about as likely to beat the other as not.
# The CONTENDER / REBUILDER weights (production : age) live on the site (web/lib/dynastyBoard.js).

suppressMessages(library(nflreadr))

POSITIONS <- c("QB", "RB", "WR", "TE")
REPL_RANK <- list(`1QB` = c(QB = 12, RB = 29, WR = 42, TE = 13), SF = c(QB = 32, RB = 29, WR = 42, TE = 13))
REPL_FROM <- 2018
V_HI      <- 15
KEEP      <- 250   # players shipped; the page shows the top 120 overall and the top 60 of a position (below that the
                   # numbers can't tell players apart: one big tier)
AGE_DATE  <- as.Date("2026-09-01")

prod <- read.csv("dynasty_production_value.csv")
ref  <- read.csv("dynasty_production_reference.csv")
agev <- read.csv("dynasty_age_value.csv")
bt   <- readRDS("backtest_production_blend_results.rds")

# replacement PPG: the weighted PPG at that rank in each season's pool, averaged over seasons
repl <- sapply(names(REPL_RANK), function(f) sapply(POSITIONS, function(p) {
  r <- REPL_RANK[[f]][[p]]
  mean(sapply(unique(ref$season[ref$season >= REPL_FROM]), function(s) {
    x <- sort(ref$ppg[ref$position == p & ref$season == s], decreasing = TRUE)
    x[min(r, length(x))]
  }))
}))
cat("replacement PPG:\n"); print(round(repl, 2))

rmse <- sapply(POSITIONS, function(p) bt$rmse[bt$position == p & bt$target == "y1" & bt$w_xfp == 0])
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
por <- function(f) round(pmin(10, pmax(1, 1 + 9 * (d$ppg_weighted - repl[cbind(d$position, f)]) / V_HI)), 2)
d$por_1qb <- por("1QB"); d$por_sf <- por("SF")
d$sd_prod <- round(sd_prod[d$position], 2)

# keep the board to the players who can matter: the top KEEP by his best score under any format / mode
d$best <- pmax(0.8 * pmax(d$por_1qb, d$por_sf) + 0.2 * d$age_value, 0.65 * pmax(d$por_1qb, d$por_sf) + 0.35 * d$age_value)
d <- d[order(-d$best), ][seq_len(min(KEEP, nrow(d))), ]
out <- d[order(-d$por_sf), c("player_id", "player", "position", "team", "age", "games_in_window", "ppg_weighted",
                              "age_value", "por_1qb", "por_sf", "sd_prod")]
write.csv(out, "dynasty_value.csv", row.names = FALSE)

# the site's data file (a plain array of rows + when it was built)
q <- function(x) if (is.character(x)) paste0('"', gsub('"', '\\\\"', x), '"') else format(x, trim = TRUE)
rows <- vapply(seq_len(nrow(out)), function(i) paste0("[", paste(vapply(out[i, ], q, ""), collapse = ","), "]"), "")
json <- sprintf('{"built":"%s","columns":[%s],"rows":[\n%s\n]}\n', format(Sys.Date()),
  paste0('"', names(out), '"', collapse = ","), paste(rows, collapse = ",\n"))
dir.create("../web/data", showWarnings = FALSE)
writeLines(json, "../web/data/dynasty-values.json")
cat("wrote dynasty_value.csv and ../web/data/dynasty-values.json:", nrow(out), "players\n")
