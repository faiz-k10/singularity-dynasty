# One-time backfill: season Targets (floor/median/ceiling) for WR/TE rows in
# the Player Season Simulations weeks that were published BEFORE Targets was
# added to projection_engine.R, so the week scrubber on the page shows a
# Targets row at every week, not just the latest.
#
# Each past week is rebuilt "as of" that week -- the player's history is cut to
# the games that existed when that week's sim was published (everything before
# 2026 week N; a week-N sim is published before week N's games), and the
# availability model is told N - 1 weeks have been completed. Targets then goes
# through exactly the same resampling as every other "yardage"-group stat in
# projection_engine.R (same recency decay, same calibrated floor/ceiling
# quantiles, same games-played model). Receptions and receiving yards are
# drawn in the same joint sample and compared against what was actually
# published that week, as a check that the as-of reconstruction matches the
# original run (weeks 2-4 do, to within Monte Carlo noise).
#
# Week 1 does not: it was published before player_availability() was fixed
# (Sep 12) and while shrinkage was still on (removed Sep 14), so today's engine
# can't reproduce it. For that week pass "scale": the reconstructed Targets are
# scaled, quantile by quantile, by (published receptions / reconstructed
# receptions), which keeps Targets consistent with the receptions that week
# actually showed (same implied catch rate as the reconstruction). That option
# was NOT applied in production: the page's week bar labels a snapshot "W3" =
# games through week 3 + the sim published for week 4, so the preseason sim
# (week 1) is never shown and was left exactly as published.
#
# Run (one process per sim week / shard, e.g. in parallel):
#   Rscript backfill_targets.R <export.json> <sim_week> <out.csv> [shard nshards [scale]]
# where <export.json> comes from web/scripts/backfill-targets.mjs export.
suppressMessages(source("projection_engine.R"))   # functions/constants only -- the engine run itself is guarded
suppressMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) >= 3)
input <- fromJSON(args[1], simplifyVector = FALSE)
sim_week <- as.integer(args[2])
out_path <- args[3]
shard <- if (length(args) >= 5) as.integer(args[4]) else 1L
nshards <- if (length(args) >= 5) as.integer(args[5]) else 1L
scale_to_published <- length(args) >= 6 && args[6] == "scale"

N_SIMS <- 30000
COLS <- c("targets", "receptions", "receiving_yards")

rows <- Filter(function(r) r$week == sim_week, input)
rows <- rows[seq_along(rows) %% nshards == shard %% nshards]
cat(sprintf("Sim week %d shard %d/%d: %d WR/TE rows to backfill%s\n", sim_week, shard, nshards, length(rows),
            if (scale_to_published) " (scaled to published receptions)" else ""))

reg <- load_history(history_seasons())
set.seed(1000 + sim_week * 10 + shard)

pub3 <- function(x) if (is.null(x)) c(NA, NA, NA) else c(x$floor, x$median, x$ceiling)

results <- vector("list", length(rows))
for (i in seq_along(rows)) {
  r <- rows[[i]]
  d <- reg[reg$player_display_name == r$player_name, ]
  d <- d[d$season < TARGET_SEASON | (d$season == TARGET_SEASON & d$week < sim_week), ]
  if (nrow(d) < MIN_GAMES || !(d$position[1] %in% r$position)) {
    cat("  skipped (not enough as-of history / position mismatch):", r$player_name, "\n")
    next
  }
  pos <- d$position[1]
  n <- nrow(d)
  idx <- seq_len(n)
  avail <- player_availability(d, TARGET_SEASON, sim_week - 1)
  w <- recency_weights(n, STAT_GROUP_DECAY[["yardage"]][pos])
  floor_q <- STAT_GROUP_FLOOR_Q[["yardage"]][pos]
  ceil_q <- STAT_GROUP_CEIL_Q[["yardage"]][pos]

  sim <- replicate(N_SIMS, {
    g <- sum(runif(MAX_GAMES_PER_SEASON) < avail)
    if (g == 0) setNames(rep(0, length(COLS)), COLS)
    else {
      s <- sample(idx, g, replace = TRUE, prob = w)
      sapply(COLS, function(col) sum(d[[col]][s]))
    }
  })
  qs <- function(col) c(
    round(as.numeric(quantile(sim[col, ], floor_q)), 0),
    round(as.numeric(quantile(sim[col, ], 0.50)), 0),
    round(as.numeric(quantile(sim[col, ], ceil_q)), 0)
  )
  t_raw <- qs("targets"); rc <- qs("receptions"); ry <- qs("receiving_yards")
  pub_rc <- pub3(r$stat_ranges$receptions); pub_ry <- pub3(r$stat_ranges$receiving_yards)

  t <- t_raw
  if (scale_to_published && !any(is.na(pub_rc))) {
    f <- ifelse(rc > 0, pub_rc / rc, 1)
    t <- round(t_raw * f, 0)
    t[2] <- max(t[2], t[1]); t[3] <- max(t[3], t[2])   # keep floor <= median <= ceiling
  }
  results[[i]] <- data.frame(
    sim_week = sim_week, player_name = r$player_name, position = pos, games = n, avail = round(avail, 4),
    t_floor = t[1], t_median = t[2], t_ceiling = t[3],
    t_raw_floor = t_raw[1], t_raw_median = t_raw[2], t_raw_ceiling = t_raw[3],
    rec_floor = rc[1], rec_median = rc[2], rec_ceiling = rc[3],
    pub_rec_floor = pub_rc[1], pub_rec_median = pub_rc[2], pub_rec_ceiling = pub_rc[3],
    yds_floor = ry[1], yds_median = ry[2], yds_ceiling = ry[3],
    pub_yds_floor = pub_ry[1], pub_yds_median = pub_ry[2], pub_yds_ceiling = pub_ry[3],
    stringsAsFactors = FALSE
  )
  if (i %% 25 == 0) cat(sprintf("  %d / %d\n", i, length(rows)))
}
out <- do.call(rbind, results)
write.csv(out, out_path, row.names = FALSE)
cat(sprintf("Wrote %d rows to %s\n", nrow(out), out_path))
