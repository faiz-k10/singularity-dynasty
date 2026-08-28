# Groundwork for age + draft-capital signal in the projection engine
# (nflreadr load_rosters() / load_draft_picks()). Two jobs:
#
#   1. player_meta() -- a reusable clean per-player-season metadata table
#      (age as of the season, years_exp, draft round/pick/overall,
#      is_udfa, height/weight, college, status). gsis_id is the universal
#      join key: load_player_stats$player_id, load_rosters$gsis_id and
#      load_draft_picks$gsis_id are all the same id. load_rosters also
#      carries sleeper_id for the /my-team join.
#
#   2. Empirical age curves per position, BOTH ways:
#      - cross-sectional: PPG by age (biased UP at old ages -- only the
#        players good enough to still have a job survive to age 32)
#      - longitudinal: within-player year-over-year change in PPG by age
#        (controls for that survivorship -- this is the real aging signal
#        and what any age adjustment should be built from)
#
# Nothing here changes projection_engine.R yet -- this is the "what does
# the age cliff actually look like in the data" pass the feature needs
# before it's designed.
#
# Run: Rscript age_curve_analysis.R

suppressMessages(library(nflreadr))
source("player_meta.R")

SEASONS      <- 2010:2025
POSITIONS    <- c("QB", "RB", "WR", "TE")
MIN_GAMES    <- 8      # a real fantasy season, not a 2-game cameo

# ------------------------------------------------------------------
# 1. Season PPG per player (regular season, PPR)
# ------------------------------------------------------------------
season_ppg <- function(seasons = SEASONS) {
  ps <- as.data.frame(load_player_stats(seasons))
  ps <- ps[ps$season_type == "REG" & ps$position %in% POSITIONS, ]
  agg <- aggregate(fantasy_points_ppr ~ player_id + season + position, ps,
                   FUN = function(x) c(g = length(x), ppg = mean(x)))
  agg <- do.call(data.frame, agg)
  names(agg) <- c("gsis_id", "season", "position", "g", "ppg")
  agg
}

cat("Loading rosters + draft picks + player stats,", min(SEASONS), "-", max(SEASONS), "...\n")
meta <- player_meta(SEASONS, POSITIONS)
ppg  <- season_ppg()

df <- merge(ppg, meta[, c("gsis_id", "season", "age", "years_exp",
                          "draft_round", "draft_overall", "is_udfa")],
            by = c("gsis_id", "season"))
df <- df[df$g >= MIN_GAMES & !is.na(df$age) & df$age >= 20 & df$age <= 38, ]
cat("Player-seasons with >=", MIN_GAMES, "games and known age:", nrow(df), "\n\n")

# ------------------------------------------------------------------
# 2a. Cross-sectional: median PPG by age (survivorship-biased upward)
# ------------------------------------------------------------------
cat("=== CROSS-SECTIONAL: median PPG by age (NOTE: biased up at old ages) ===\n")
for (pos in POSITIONS) {
  s <- df[df$position == pos, ]
  ages <- 21:34
  cat(sprintf("\n%s\n", pos))
  for (a in ages) {
    v <- s$ppg[floor(s$age) == a]
    if (length(v) >= 5)
      cat(sprintf("  age %2d  n=%3d  median=%5.1f  mean=%5.1f\n",
                  a, length(v), median(v), mean(v)))
  }
}

# ------------------------------------------------------------------
# 2b. Longitudinal: within-player YoY change in PPG, by age
#     (the real aging signal -- same player, season N-1 -> N)
# ------------------------------------------------------------------
cat("\n\n=== LONGITUDINAL: mean YoY change in PPG, by age reached ===\n")
cat("(same player, consecutive seasons, >=", MIN_GAMES, "g both years; controls for survivorship)\n")
df <- df[order(df$gsis_id, df$season), ]
df$prev_ppg <- NA_real_
df$prev_season <- NA_integer_
for (i in 2:nrow(df)) {
  if (df$gsis_id[i] == df$gsis_id[i - 1] &&
      df$season[i] == df$season[i - 1] + 1) {
    df$prev_ppg[i] <- df$ppg[i - 1]
    df$prev_season[i] <- df$season[i - 1]
  }
}
paired <- df[!is.na(df$prev_ppg), ]
paired$delta <- paired$ppg - paired$prev_ppg
paired$pct   <- ifelse(paired$prev_ppg > 3, paired$delta / paired$prev_ppg, NA)

for (pos in POSITIONS) {
  s <- paired[paired$position == pos, ]
  cat(sprintf("\n%s  (n=%d transitions)\n", pos, nrow(s)))
  for (a in 22:34) {
    v <- s[floor(s$age) == a, ]
    if (nrow(v) >= 8)
      cat(sprintf("  ->age %2d  n=%3d  mean d=%+5.1f  median d=%+5.1f  mean %%=%+5.1f%%\n",
                  a, nrow(v), mean(v$delta), median(v$delta),
                  100 * mean(v$pct, na.rm = TRUE)))
  }
}

# ------------------------------------------------------------------
# 2c. Peak age + "still producing at age X" survival, per position
# ------------------------------------------------------------------
cat("\n\n=== PEAK AGE (cross-sectional median) + share of top-24 seasons by age band ===\n")
for (pos in POSITIONS) {
  s <- df[df$position == pos, ]
  by_age <- tapply(s$ppg, floor(s$age), median)
  by_age <- by_age[sapply(split(s$ppg, floor(s$age)), length) >= 5]
  peak <- names(by_age)[which.max(by_age)]
  bands <- cut(s$age, c(0, 24, 27, 30, 100), labels = c("<=24", "25-27", "28-30", "31+"))
  topN <- s$ppg >= sort(s$ppg, decreasing = TRUE)[min(24 * length(unique(s$season)), nrow(s))]
  cat(sprintf("\n%s  peak age ~%s\n", pos, peak))
  print(round(prop.table(table(bands[topN])) * 100, 1))
}

# ------------------------------------------------------------------
# 2d. Draft capital: does it still matter once we know the player's history?
#     (rookie + year-2 seasons only -- where the model's own sample is thin)
# ------------------------------------------------------------------
cat("\n\n=== DRAFT CAPITAL vs early-career PPG (years_exp <= 1) ===\n")
early <- df[df$years_exp <= 1 & !is.na(df$draft_overall), ]
early$bucket <- cut(early$draft_overall, c(0, 15, 40, 75, 150, 300),
                    labels = c("top15", "16-40", "41-75", "76-150", "151+"))
for (pos in POSITIONS) {
  s <- early[early$position == pos, ]
  if (nrow(s) < 10) next
  cat(sprintf("\n%s\n", pos))
  agg <- tapply(s$ppg, s$bucket, function(x) sprintf("n=%d median=%.1f mean=%.1f", length(x), median(x), mean(x)))
  for (b in names(agg)) if (!is.na(agg[b])) cat(sprintf("  %-8s %s\n", b, agg[b]))
}
udfa <- df[df$years_exp <= 1 & df$is_udfa, ]
cat(sprintf("\n  UDFA early-career: n=%d median=%.1f mean=%.1f\n",
            nrow(udfa), median(udfa$ppg), mean(udfa$ppg)))

cat("\nDone.\n")
