# Is the Game Board's "points still to come" rule calibrated?   Rscript backtest_live_remaining_points.R <published-projections.csv>
#
# The rule in web/lib/winChance.js: with f = share of the game left, a player's remaining points are centred on f x his weekly median with a spread of
# sqrt(f) x his full-game spread (the weekly floor / ceiling are his 10th / 90th percentiles). Sleeper's live win chance disagrees with it (the founder's
# readings in CLAUDE.md: Sleeper expects much less than f x median from a player who is already ahead of his projection). This tests the rule on real games:
#
#   unit    every QB / RB / WR / TE game of 2026 weeks 1-7 with a published median of at least 5 (starter level), PPR points rebuilt PLAY BY PLAY
#           from nflfastR, split at halftime (f = 0.5) and at the end of the 3rd quarter (f = 0.25)
#   known   the projection as PUBLISHED that week (redraft_rankings: median, floor, ceiling) and his points before the cut
#   target  his points after the cut
#
# Checks: (1) is the average remaining total f x median? (2) does it depend on how far ahead of / behind his projection he already is (the Sleeper
# disagreement: if the rule is right the second half does not care what the first half did)? (3) are the 10th / 90th percentile limits of the remaining
# points hit 10% of the time each? (4) which simple rule predicts the remaining points best?
suppressMessages({ library(nflreadr) })
args <- commandArgs(trailingOnly = TRUE)
proj <- read.csv(if (length(args)) args[1] else "projections_2026.csv", stringsAsFactors = FALSE)
proj <- proj[proj$week <= 7 & proj$position %in% c("QB", "RB", "WR", "TE") & !is.na(proj$projection) & proj$projection >= 5, ]
norm <- function(x) { x <- tolower(x); x <- gsub("[^a-z ]", "", x); x <- gsub("\\b(jr|sr|ii|iii|iv|v)\\b", "", x); trimws(gsub("\\s+", " ", x)) }
proj$key <- paste(norm(proj$player_name), proj$week)

pbp <- as.data.frame(load_pbp(2026)); pbp <- pbp[pbp$season_type == "REG" & pbp$week <= 7 & !is.na(pbp$game_seconds_remaining), ]
ev <- function(id, pts) data.frame(game_id = pbp$game_id, week = pbp$week, player_id = id, secs = pbp$game_seconds_remaining, pts = pts, stringsAsFactors = FALSE)
z <- function(x) ifelse(is.na(x), 0, x)
events <- rbind(
  ev(pbp$passer_player_id, z(pbp$passing_yards) * 0.04 + z(pbp$pass_touchdown) * 4 - z(pbp$interception) * 2),
  ev(pbp$rusher_player_id, z(pbp$rushing_yards) * 0.1 + z(pbp$rush_touchdown) * 6),
  ev(pbp$receiver_player_id, z(pbp$receiving_yards) * 0.1 + z(pbp$complete_pass) + z(pbp$pass_touchdown) * 6),
  ev(pbp$fumbled_1_player_id, -2 * z(pbp$fumble_lost))
)
# two-point tries: 2 points to the passer and to the target / runner of a successful try
ok <- !is.na(pbp$two_point_conv_result) & pbp$two_point_conv_result == "success"
events <- rbind(events, ev(ifelse(ok, pbp$passer_player_id, NA), ifelse(ok, 2, 0)), ev(ifelse(ok, pbp$receiver_player_id, NA), ifelse(ok, 2, 0)), ev(ifelse(ok, pbp$rusher_player_id, NA), ifelse(ok, 2, 0)))
events <- events[!is.na(events$player_id) & events$pts != 0, ]

st <- as.data.frame(load_player_stats(2026)); st <- st[st$season_type == "REG" & st$week <= 7 & st$position %in% c("QB", "RB", "WR", "TE"), c("player_id", "player_display_name", "week", "team")]
st$key <- paste(norm(st$player_display_name), st$week)
pg <- merge(proj, st, by = "key", suffixes = c("", ".st"))        # a player-game we have a projection for AND who is in the week's stats
pg <- pg[!duplicated(pg$key), ]
# the game each player played in that week (from the plays he touched; a player with no plays gets his team's game via the stats team)
gm <- unique(events[, c("game_id", "week", "player_id")]); names(gm)[1] <- "game_id"
pg <- merge(pg, gm, by.x = c("player_id", "week"), by.y = c("player_id", "week"))
cat(sprintf("player-games with a projection >= 5 and play-by-play: %d\n", nrow(pg)))

run <- function(f) {
  cut <- 3600 * f                                              # plays with secs > cut are before it
  e <- merge(events, pg[, c("player_id", "game_id", "key")], by = c("player_id", "game_id"))
  before <- tapply(e$pts[e$secs > cut], e$key[e$secs > cut], sum)
  after <- tapply(e$pts[e$secs <= cut], e$key[e$secs <= cut], sum)
  d <- pg; d$before <- as.numeric(before[d$key]); d$after <- as.numeric(after[d$key])
  d$before[is.na(d$before)] <- 0; d$after[is.na(d$after)] <- 0
  d$med <- d$projection; d$exp_after <- f * d$med
  d$surplus <- d$before - (1 - f) * d$med                     # points so far minus the share of his median he was "due" by now
  q10 <- d$exp_after - sqrt(f) * (d$med - d$floor); q90 <- d$exp_after + sqrt(f) * (d$ceiling - d$med)
  cat(sprintf("\n================ f = %.2f share of the game left (%d player-games) ================\n", f, nrow(d)))
  cat(sprintf("mean points after the cut: %.2f   mean f x median: %.2f   (mean f x projection is the rule's centre; the median sits below the mean of a skewed outcome)\n", mean(d$after), mean(d$exp_after)))
  cat(sprintf("share of players ABOVE f x median after the cut: %.1f%%   (50%% = a calibrated median)\n", 100 * mean(d$after > d$exp_after)))
  cat(sprintf("below the rule's 10th percentile: %.1f%%   above its 90th: %.1f%%   (targets 10 / 10)\n", 100 * mean(d$after < q10), 100 * mean(d$after > q90)))
  d$bin <- cut(d$surplus, c(-Inf, -8, -3, 3, 8, Inf), labels = c("far behind (< -8)", "behind (-8..-3)", "on pace (-3..3)", "ahead (3..8)", "far ahead (> 8)"))
  tb <- do.call(rbind, lapply(levels(d$bin), function(b) { x <- d[d$bin == b, ]; if (!nrow(x)) return(NULL)
    data.frame(first_part = b, n = nrow(x), mean_before = round(mean(x$before), 1), rule_after = round(mean(x$exp_after), 2), actual_after = round(mean(x$after), 2),
      gap = round(mean(x$after) - mean(x$exp_after), 2), above_rule_median = round(100 * mean(x$after > x$exp_after), 1)) }))
  cat("\nDoes what he did before the cut change what he does after? (the rule says no: gap = 0)\n"); print(tb, row.names = FALSE)
  fit <- lm(after ~ exp_after + surplus, d)
  cat(sprintf("\nregression after ~ f x median + surplus:  surplus coefficient %.3f (se %.3f)   (0 = the rule is right; -1 = 'final stays at his projection')\n", coef(fit)["surplus"], summary(fit)$coefficients["surplus", 2]))
  cat(sprintf("                                           f x median coefficient %.3f (se %.3f)   (1 = the rule's scale is right)\n", coef(fit)["exp_after"], summary(fit)$coefficients["exp_after", 2]))
  rules <- list("rule: f x median" = d$exp_after, "final stays at median (median - before, floored at 15% of f x median)" = pmax(d$med - d$before, 0.15 * d$exp_after),
    "rule with 0.9 scale" = 0.9 * d$exp_after, "fitted: a + b x f x median + c x surplus" = fitted(fit))
  cat("\nHow well each guess predicts the points after the cut:\n")
  print(data.frame(rule = names(rules), MAE = round(sapply(rules, function(p) mean(abs(d$after - p))), 3), RMSE = round(sapply(rules, function(p) sqrt(mean((d$after - p)^2))), 3), row.names = NULL), row.names = FALSE)
  invisible(d)
}
for (f in c(0.5, 0.25)) run(f)
