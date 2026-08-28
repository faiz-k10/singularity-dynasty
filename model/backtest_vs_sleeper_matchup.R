# Same head-to-head as backtest_vs_sleeper.R, with the walk-forward-safe
# matchup adjustment layered onto "your model" side -- Sleeper's own
# numbers already reflect matchup context (their rotowire source
# presumably accounts for opponent strength), so an apples-to-apples test
# should give your model that same signal, not leave it off for no
# reason. Uses the exact same matchup_mult_asof() logic already
# validated in backtest_matchup_mult.R (compute_matchup_multipliers()'s
# real formula, restricted to already-elapsed weeks only -- no lookahead).
#
# Run: Rscript backtest_vs_sleeper_matchup.R

suppressMessages(library(nflreadr))
suppressMessages(library(jsonlite))
suppressMessages(library(httr))

EXCLUDE_WEEKS <- c(18)
TEST_SEASONS <- c(2024, 2025)
TEST_WEEKS <- 3:17
LOOKBACK_YEARS <- 3
MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
PASS_PTS_DECAY_QB <- 0.79
RUSH_PTS_DECAY_QB <- 0.88
N_SIMS <- 3000
MATCHUP_FULL_SAMPLE_GAMES <- 8
MATCHUP_MULT_FLOOR <- 0.90
MATCHUP_MULT_CEIL <- 1.10
set.seed(42)

recency_weights <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
weighted_quantile <- function(x, w, q) {
  if (sum(w) <= 0) w <- rep(1, length(w))
  o <- order(x); x <- x[o]; w <- w[o]
  cw <- (cumsum(w) - 0.5 * w) / sum(w)
  as.numeric(approx(cw, x, q, rule = 2)$y)
}
normalize_join_name <- function(name) {
  tolower(gsub("\\s+(jr|sr|ii|iii|iv|v)$", "", gsub("\\.", "", name), ignore.case = TRUE))
}

cat("Loading nflreadr player stats...\n")
all_seasons <- (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)
raw <- as.data.frame(load_player_stats(seasons = all_seasons))
reg <- raw[raw$season_type == "REG",
           c("player_display_name", "position", "season", "week", "fantasy_points_ppr",
             "passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds",
             "opponent_team")]
reg <- reg[reg$position %in% c("QB", "RB", "WR", "TE"), ]
reg <- reg[!(reg$week %in% EXCLUDE_WEEKS), ]
reg <- reg[!is.na(reg$fantasy_points_ppr), ]
for (col in c("passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds")) {
  reg[[col]][is.na(reg[[col]])] <- 0
}
reg$pass_pts <- 0.04 * reg$passing_yards + 4 * reg$passing_tds - 2 * reg$passing_interceptions
reg$rush_pts <- 0.1 * reg$rushing_yards + 6 * reg$rushing_tds
reg <- reg[order(reg$player_display_name, reg$season, reg$week), ]
cat("Loaded", nrow(reg), "rows.\n\n")

# Exact compute_matchup_multipliers() formula, restricted to a caller-given
# (season, week) cutoff -- same as backtest_matchup_mult.R.
matchup_mult_asof <- function(before_season, before_week) {
  d <- reg[!is.na(reg$opponent_team) &
             (reg$season == before_season - 1 |
                (reg$season == before_season & reg$week < before_week)), ]
  if (nrow(d) == 0) return(NULL)
  allowed <- aggregate(fantasy_points_ppr ~ opponent_team + position + season + week,
                        data = d, FUN = sum)
  names(allowed)[names(allowed) == "opponent_team"] <- "defense"
  league_avg <- tapply(allowed$fantasy_points_ppr, allowed$position, mean)
  defense_avg <- aggregate(fantasy_points_ppr ~ defense + position, data = allowed, FUN = mean)
  defense_games <- aggregate(fantasy_points_ppr ~ defense + position, data = allowed, FUN = length)
  names(defense_games)[3] <- "games"
  m <- merge(defense_avg, defense_games, by = c("defense", "position"))
  m$league_avg <- league_avg[m$position]
  m$raw_mult <- m$fantasy_points_ppr / m$league_avg
  m$shrink_share <- pmin(m$games / MATCHUP_FULL_SAMPLE_GAMES, 1)
  m$mult <- 1 + m$shrink_share * (m$raw_mult - 1)
  m$mult <- pmin(pmax(m$mult, MATCHUP_MULT_FLOOR), MATCHUP_MULT_CEIL)
  setNames(m$mult, paste(m$defense, m$position))
}

fetch_sleeper_week <- function(season, week) {
  positions <- c("QB", "RB", "WR", "TE")
  params <- paste(sapply(positions, function(p) paste0("position[]=", p)), collapse = "&")
  url <- sprintf("https://api.sleeper.app/projections/nfl/%d/%d?season_type=regular&%s", season, week, params)
  res <- tryCatch(httr::GET(url, httr::timeout(20)), error = function(e) NULL)
  if (is.null(res) || httr::status_code(res) != 200) return(NULL)
  data <- tryCatch(jsonlite::fromJSON(httr::content(res, "text", encoding = "UTF-8"), simplifyDataFrame = FALSE),
                    error = function(e) NULL)
  if (is.null(data) || length(data) == 0) return(NULL)
  out <- lapply(data, function(e) {
    if (is.null(e$player) || is.null(e$stats) || is.null(e$stats$pts_ppr)) return(NULL)
    name <- paste(e$player$first_name, e$player$last_name)
    list(name = name, pts_ppr = e$stats$pts_ppr)
  })
  out <- out[!sapply(out, is.null)]
  if (length(out) == 0) return(NULL)
  setNames(sapply(out, `[[`, "pts_ppr"), normalize_join_name(sapply(out, `[[`, "name")))
}

sleeper_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
model_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
model_nomatchup_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
both_n <- 0

for (season in TEST_SEASONS) {
  for (week in TEST_WEEKS) {
    sleeper_lookup <- fetch_sleeper_week(season, week)
    if (is.null(sleeper_lookup)) { cat("Skipping", season, "wk", week, "-- no Sleeper data\n"); next }

    mult_lookup <- matchup_mult_asof(season, week)

    week_actual <- reg[reg$season == season & reg$week == week, ]
    if (nrow(week_actual) == 0) next

    for (r in seq_len(nrow(week_actual))) {
      p <- week_actual$player_display_name[r]
      pos <- week_actual$position[r]
      opp <- week_actual$opponent_team[r]
      actual <- week_actual$fantasy_points_ppr[r]

      hist <- reg[reg$player_display_name == p &
                    (reg$season < season | (reg$season == season & reg$week < week)) &
                    reg$season >= season - LOOKBACK_YEARS, ]
      n <- nrow(hist)
      if (n < 8) next

      skey <- normalize_join_name(p)
      if (!(skey %in% names(sleeper_lookup))) next
      sleeper_pred <- sleeper_lookup[[skey]]

      if (pos == "QB") {
        w_pass <- recency_weights(n, PASS_PTS_DECAY_QB)
        w_rush <- recency_weights(n, RUSH_PTS_DECAY_QB)
        sim <- sample(hist$pass_pts, N_SIMS, replace = TRUE, prob = w_pass) +
          sample(hist$rush_pts, N_SIMS, replace = TRUE, prob = w_rush)
        model_pred_raw <- as.numeric(quantile(sim, 0.50))
      } else {
        w <- recency_weights(n, MED_DECAY[[pos]])
        model_pred_raw <- weighted_quantile(hist$fantasy_points_ppr, w, 0.50)
      }

      mult <- 1
      if (!is.null(mult_lookup) && !is.na(opp)) {
        key <- paste(opp, pos)
        if (key %in% names(mult_lookup)) mult <- mult_lookup[[key]]
      }
      model_pred <- model_pred_raw * mult

      sleeper_err[[pos]] <- c(sleeper_err[[pos]], abs(actual - sleeper_pred))
      model_err[[pos]] <- c(model_err[[pos]], abs(actual - model_pred))
      model_nomatchup_err[[pos]] <- c(model_nomatchup_err[[pos]], abs(actual - model_pred_raw))
      both_n <- both_n + 1
    }
    cat("Done", season, "week", week, "-- running total n =", both_n, "\n")
  }
}

cat("\n=== FINAL: your model WITH matchup adjustment vs. Sleeper's real projections ===\n")
overall_s <- c(); overall_m <- c(); overall_mn <- c()
for (pos in c("QB", "RB", "WR", "TE")) {
  s <- sleeper_err[[pos]]; m <- model_err[[pos]]; mn <- model_nomatchup_err[[pos]]
  cat(sprintf("%s  n=%d  Sleeper MAE=%.3f  Yours(+matchup) MAE=%.3f  Yours(no matchup) MAE=%.3f  you win %.1f%%\n",
              pos, length(s), mean(s), mean(m), mean(mn), mean(m < s) * 100))
  overall_s <- c(overall_s, s); overall_m <- c(overall_m, m); overall_mn <- c(overall_mn, mn)
}
cat(sprintf("\nOVERALL  n=%d  Sleeper MAE=%.3f  Yours(+matchup) MAE=%.3f  Yours(no matchup) MAE=%.3f  you win %.1f%%\n",
            length(overall_s), mean(overall_s), mean(overall_m), mean(overall_mn), mean(overall_m < overall_s) * 100))
