# Rebuilds ceiling_range_low / ceiling_probability for Best Ball Rankings,
# replacing values that couldn't be reconciled with the model (see README /
# session notes — the previous values didn't reverse-engineer to any
# consistent quantile of the real weighted distribution).
#
# Design (deterministic, no new calibration needed):
#   ceiling_range_low = median + 0.5 * (ceiling_score - median)
#     -- the midpoint between "a typical week" and "the calibrated ceiling",
#     -- i.e. "a genuinely good week", using two numbers already trusted.
#   ceiling_probability = EXACT probability of exceeding that threshold,
#     computed from the same weighted (and shrink-blended, where
#     applicable) distribution that produces every other number in this
#     model. Not simulated -- computed directly from the weighted CDF, so
#     it's exact, not noisy.

source("projection_engine.R")

# Same date-derived week export_for_supabase() resolves to, so an OUT
# player gets zeroed here too instead of showing a nonzero
# ceiling_range_low next to a 0 ceiling_score.
WEEK <- current_nfl_week(max(2023:2025) + 1)
out_players <- tryCatch(load_out_players(max(2023:2025) + 1, WEEK), error = function(e) character(0))

reg <- load_history(2023:2025)
counts <- table(reg$player_display_name)
eligible <- names(counts[counts >= MIN_GAMES])

df <- read.csv("projections.csv", stringsAsFactors = FALSE)

# Same shrink-eligible set and baseline pools as the main engine run.
shrink_players <- names(counts[counts >= MIN_GAMES & counts < LOW_SAMPLE_SHRINK_THRESHOLD])
baseline_pools <- list()
if (length(shrink_players) > 0) {
  shrink_positions <- unique(sapply(shrink_players, function(p)
    reg$position[reg$player_display_name == p][1]))
  for (pos in shrink_positions) baseline_pools[[pos]] <- build_common_pool(reg, eligible, pos)
}

# P(X > threshold) from a weighted empirical distribution.
weighted_exceed_prob <- function(x, w, threshold) sum(w[x > threshold])

rows <- vector("list", nrow(df))
for (i in seq_len(nrow(df))) {
  p <- df$player_name[i]; pos <- df$position[i]
  x <- reg$fantasy_points_ppr[reg$player_display_name == p]
  n <- length(x)
  wc <- recency_weights(n, CEIL_DECAY[pos])

  range_low <- df$median[i] + 0.5 * (df$ceiling[i] - df$median[i])

  own_prob <- weighted_exceed_prob(x, wc, range_low)
  if (df$shrunk[i] && !is.null(baseline_pools[[pos]])) {
    base <- baseline_pools[[pos]]
    base_prob <- mean(base$pool > range_low)
    prob <- SHRINK_OWN_SHARE * own_prob + (1 - SHRINK_OWN_SHARE) * base_prob
  } else {
    prob <- own_prob
  }

  is_out <- p %in% out_players
  rows[[i]] <- data.frame(
    player_name = p,
    ceiling_range_low = if (is_out) 0 else round(range_low, 0),
    ceiling_probability = if (is_out) 0 else round(100 * prob, 0)
  )
}
out <- do.call(rbind, rows)
write.csv(out, "upload_ceiling_range.csv", row.names = FALSE)
cat("Wrote upload_ceiling_range.csv (", nrow(out), "rows )\n")

cat("\n=== Spot check ===\n")
print(head(merge(df[,c("player_name","median","ceiling")], out, by="player_name"), 10), row.names=FALSE)
