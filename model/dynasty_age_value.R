# Dynasty age value: a 1-10 score for a player's AGE, set per position from how much
# fantasy production players of that position actually keep over the next few seasons.
#
#   Rscript dynasty_age_value.R           # prints the curves, writes dynasty_age_value.csv
#
#   source("dynasty_age_value.R"); age_value(c("RB","WR","QB"), c(27, 27, 27))
#
# Method (one rule for every position, so the scores are comparable ACROSS positions):
#   1. Every player-season with >= MIN_GAMES at age a (age as of Sept 1, `player_meta.R`).
#   2. For each of the next k = 1..HORIZON seasons, his PPR points per game then, counting a season he
#      doesn't qualify for (retired, cut, hurt, benched: fewer than MIN_GAMES) as ZERO. That keeps the
#      survivorship the plain "PPG by age" plot hides: only players good enough to keep a job show up at 33.
#   3. Retained_k(pos, a) = sum of those future PPG / sum of the same players' PPG at age a (a ratio of
#      sums, so one big ratio from a tiny base can't move it). Seasons not yet played are left out of that k.
#   4. Retained(pos, a) = sum_k DISCOUNT^k * Retained_k  (the nearer seasons count more).
#   5. Smoothed across age within the position (a weighted loess, weights = sample size), then put on a
#      FIXED 1-10 scale shared by all positions: 10 = the best Retained of any position / age on the grid,
#      1 = the worst. The anchors are saved in the CSV header so a later run can't quietly shift the scale.
#
# Why a ratio to the player's own current PPG: a 22-year-old RB and a 28-year-old RB have different
# production, but "what share of THIS level do you still have in k years" is the age effect alone.

suppressMessages(library(nflreadr))
source("player_meta.R")

SEASONS   <- 2008:2025
POSITIONS <- c("QB", "RB", "WR", "TE")
MIN_GAMES <- 8
HORIZON   <- 5
DISCOUNT  <- 0.85          # a season k years out counts DISCOUNT^k as much as the next one's
AGES      <- 21:35         # the grid; younger / older players read the nearest end
MIN_N     <- 12            # a (position, age) cell thinner than this is left to the smoother

season_ppg <- function() {
  ps <- as.data.frame(load_player_stats(SEASONS))
  ps <- ps[ps$season_type == "REG" & ps$position %in% POSITIONS, ]
  a <- aggregate(fantasy_points_ppr ~ player_id + season + position, ps,
                 FUN = function(x) c(g = length(x), ppg = mean(x)))
  a <- do.call(data.frame, a)
  names(a) <- c("gsis_id", "season", "position", "g", "ppg")
  a
}

cat("Loading player stats + rosters", min(SEASONS), "-", max(SEASONS), "...\n")
meta <- player_meta(SEASONS, POSITIONS)
ppg  <- season_ppg()
df <- merge(ppg, meta[, c("gsis_id", "season", "age")], by = c("gsis_id", "season"))
df <- df[df$g >= MIN_GAMES & !is.na(df$age), ]
df$a <- floor(df$age)
last_season <- max(SEASONS)

# future PPG at t+k, 0 when he has no qualifying season then (only for seasons already played)
key <- paste(df$gsis_id, df$season)
fut <- function(k) {
  i <- match(paste(df$gsis_id, df$season + k), key)
  ifelse(is.na(i), 0, df$ppg[i])
}

rows <- list()
for (pos in POSITIONS) {
  s <- df[df$position == pos, ]
  for (a in AGES) {
    u <- s[s$a == a, ]
    if (nrow(u) == 0) next
    ret <- 0; wsum <- 0; n <- nrow(u)
    for (k in 1:HORIZON) {
      ok <- u$season + k <= last_season
      if (sum(ok) < MIN_N) next
      uu <- u[ok, ]
      i <- match(paste(uu$gsis_id, uu$season + k), key)
      f <- ifelse(is.na(i), 0, df$ppg[i])
      ret  <- ret  + DISCOUNT^k * sum(f) / sum(uu$ppg)
      wsum <- wsum + DISCOUNT^k
    }
    if (wsum > 0) rows[[length(rows) + 1]] <- data.frame(position = pos, age = a, n = n,
                                                         retained = ret / sum(DISCOUNT^(1:HORIZON)))
  }
}
raw <- do.call(rbind, rows)

# smooth within position: weighted loess over age, weights = n; thin cells (n < MIN_N) get no say
smooth_pos <- function(d) {
  d <- d[d$n >= MIN_N, ]
  fit <- loess(retained ~ age, data = d, weights = d$n, span = 0.9, degree = 2,
               control = loess.control(surface = "direct"))
  g <- data.frame(age = AGES)
  g$smooth <- predict(fit, g)
  # outside the data the loess is unreliable: hold the nearest well-sampled age's value
  lo <- min(d$age); hi <- max(d$age)
  g$smooth[g$age < lo] <- g$smooth[g$age == lo]
  g$smooth[g$age > hi] <- g$smooth[g$age == hi] * (0.85^(g$age[g$age > hi] - hi))  # past the data: keep falling
  g
}
curves <- do.call(rbind, lapply(POSITIONS, function(p) {
  g <- smooth_pos(raw[raw$position == p, ]); g$position <- p; g
}))
curves <- merge(curves, raw[, c("position", "age", "n", "retained")], by = c("position", "age"), all.x = TRUE)
curves <- curves[order(curves$position, curves$age), ]

# fixed 1-10 scale across all positions
ANCHOR_HI <- max(curves$smooth)
ANCHOR_LO <- min(curves$smooth)
curves$age_value <- round(1 + 9 * (curves$smooth - ANCHOR_LO) / (ANCHOR_HI - ANCHOR_LO), 1)

# ------------------------------------------------------------------
cat("\nRetained production index (1.00 = same PPG as now, every year; below 1 = fades / drops out)\n")
cat(sprintf("anchors: 10 = %.3f   1 = %.3f\n\n", ANCHOR_HI, ANCHOR_LO))
w <- reshape(curves[, c("position", "age", "age_value")], idvar = "age", timevar = "position", direction = "wide")
names(w) <- sub("age_value.", "", names(w))
print(w[, c("age", POSITIONS)], row.names = FALSE)
cat("\nraw retained (before smoothing) and sample size:\n")
print(reshape(raw[raw$n >= MIN_N, c("position", "age", "retained")], idvar = "age", timevar = "position", direction = "wide"), digits = 3, row.names = FALSE)
print(reshape(raw[, c("position", "age", "n")], idvar = "age", timevar = "position", direction = "wide"), row.names = FALSE)

out <- curves[, c("position", "age", "age_value", "smooth", "retained", "n")]
names(out) <- c("position", "age", "age_value", "retained_smooth", "retained_raw", "n")
write.csv(out, "dynasty_age_value.csv", row.names = FALSE)
cat("\nwrote dynasty_age_value.csv\n")

# ------------------------------------------------------------------
# Lookup for the pipeline: age (can be fractional) + position -> 1-10 (linear between whole ages)
age_value <- function(position, age, table = out) {
  mapply(function(p, a) {
    t <- table[table$position == p, ]
    if (nrow(t) == 0) return(NA_real_)
    approx(t$age, t$age_value, xout = min(max(a, min(t$age)), max(t$age)))$y
  }, position, age, USE.NAMES = FALSE)
}
