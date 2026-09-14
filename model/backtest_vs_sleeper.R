# Real head-to-head: your model's actual live methodology vs. Sleeper's
# own published weekly projections, both scored against real outcomes,
# across many real past weeks. Not a guess -- Sleeper's projections API
# turns out to retain historical projections (confirmed: a real,
# non-empty response for 2025 week 10, a completed week), so this is a
# genuine backtest, not speculation about "who's probably better."
#
# Your model side: rebuilds exactly what project_all() does for each
# position at prediction time -- RB/WR/TE via weighted_quantile(history,
# recency_weights(n, MED_DECAY[pos]), 0.50); QB via the live split
# (independently-resampled pass/rush quantile). Matchup_mult and
# shrinkage are NOT included here (too complex to walk-forward safely at
# this scope) -- this tests the CORE recency-weighted mechanism, not the
# full production pipeline overlay-for-overlay. Caveat accordingly.
#
# Sleeper side: their own real historical projections, pts_ppr, fetched
# live per (season, week).
#
# Run: Rscript backtest_vs_sleeper.R

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
             "passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds")]
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

BLEND_WEIGHTS <- seq(0, 1, by = 0.1)  # 0 = pure Sleeper, 1 = pure our model

sleeper_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
model_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
blend_err <- setNames(lapply(BLEND_WEIGHTS, function(w) list(QB=c(), RB=c(), WR=c(), TE=c())),
                       as.character(BLEND_WEIGHTS))
both_n <- 0

for (season in TEST_SEASONS) {
  for (week in TEST_WEEKS) {
    sleeper_lookup <- fetch_sleeper_week(season, week)
    if (is.null(sleeper_lookup)) { cat("Skipping", season, "wk", week, "-- no Sleeper data\n"); next }

    week_actual <- reg[reg$season == season & reg$week == week, ]
    if (nrow(week_actual) == 0) next

    for (r in seq_len(nrow(week_actual))) {
      p <- week_actual$player_display_name[r]
      pos <- week_actual$position[r]
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
        model_pred <- as.numeric(quantile(sim, 0.50))
      } else {
        w <- recency_weights(n, MED_DECAY[[pos]])
        model_pred <- weighted_quantile(hist$fantasy_points_ppr, w, 0.50)
      }

      sleeper_err[[pos]] <- c(sleeper_err[[pos]], abs(actual - sleeper_pred))
      model_err[[pos]] <- c(model_err[[pos]], abs(actual - model_pred))
      for (w in BLEND_WEIGHTS) {
        blended <- w * model_pred + (1 - w) * sleeper_pred
        wk <- as.character(w)
        blend_err[[wk]][[pos]] <- c(blend_err[[wk]][[pos]], abs(actual - blended))
      }
      both_n <- both_n + 1
    }
    cat("Done", season, "week", week, "-- running total n =", both_n, "\n")
    flush(stdout())
  }
  # Checkpoint after each season -- a run that gets cut off (this
  # environment killed the first attempt partway through, silently, no R
  # error, right at the 2024->2025 boundary) still leaves usable partial
  # results on disk instead of losing the whole run's work.
  saveRDS(list(sleeper_err = sleeper_err, model_err = model_err, blend_err = blend_err, both_n = both_n),
          sprintf("backtest_checkpoint_%d.rds", season))
  cat("Checkpoint saved: backtest_checkpoint_", season, ".rds (n=", both_n, ")\n", sep = "")
  flush(stdout())
}

cat("\n=== FINAL: your model's core methodology vs. Sleeper's real projections ===\n")
overall_s <- c(); overall_m <- c()
for (pos in c("QB", "RB", "WR", "TE")) {
  s <- sleeper_err[[pos]]; m <- model_err[[pos]]
  win_rate <- mean(m < s) * 100
  cat(sprintf("%s  n=%d  Sleeper MAE=%.3f  Yours MAE=%.3f  you win %.1f%% of individual predictions\n",
              pos, length(s), mean(s), mean(m), win_rate))
  overall_s <- c(overall_s, s); overall_m <- c(overall_m, m)
}
cat(sprintf("\nOVERALL  n=%d  Sleeper MAE=%.3f  Yours MAE=%.3f  you win %.1f%% of individual predictions\n",
            length(overall_s), mean(overall_s), mean(overall_m), mean(overall_m < overall_s) * 100))

cat("\n=== BLEND SWEEP: blended = w*yours + (1-w)*sleeper, scored by MAE ===\n")
cat("(w=0.0 is pure Sleeper == the row above; w=1.0 is pure yours == the row above)\n\n")
cat(sprintf("%-5s %8s %8s %8s %8s %8s\n", "w", "QB", "RB", "WR", "TE", "OVERALL"))
best_w <- NA; best_mae <- Inf
for (w in BLEND_WEIGHTS) {
  wk <- as.character(w)
  pos_mae <- sapply(c("QB","RB","WR","TE"), function(pos) mean(blend_err[[wk]][[pos]]))
  overall_mae <- mean(unlist(blend_err[[wk]]))
  cat(sprintf("%-5.1f %8.3f %8.3f %8.3f %8.3f %8.3f\n",
              w, pos_mae["QB"], pos_mae["RB"], pos_mae["WR"], pos_mae["TE"], overall_mae))
  if (overall_mae < best_mae) { best_mae <- overall_mae; best_w <- w }
}
cat(sprintf("\nBest overall blend weight: w=%.1f (yours) / %.1f (sleeper), MAE=%.3f\n",
            best_w, 1 - best_w, best_mae))

cat("\n=== BEST BLEND WEIGHT PER POSITION ===\n")
for (pos in c("QB", "RB", "WR", "TE")) {
  pos_maes <- sapply(BLEND_WEIGHTS, function(w) mean(blend_err[[as.character(w)]][[pos]]))
  best_pos_w <- BLEND_WEIGHTS[which.min(pos_maes)]
  cat(sprintf("%s: best w=%.1f, MAE=%.3f (vs. pure yours w=1.0 MAE=%.3f, pure sleeper w=0.0 MAE=%.3f)\n",
              pos, best_pos_w, min(pos_maes), pos_maes[length(pos_maes)], pos_maes[1]))
}
