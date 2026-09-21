# Re-sweep of SLEEPER_BLEND_WEIGHT against the PRODUCTION median (the README's
# own stated caveat: the original sweep used the raw core median, but the
# shipped number already has the RB/WR/TE 85/15 quantile/mean debias and the
# QB pass/rush weighted-mean). Built to resist overfitting:
#
#   1. Coarse grid (0.1 steps), per position.
#   2. Cross-season validation: pick each position's weight on ONE season,
#      score it on the OTHER (2024<->2025), so every reported "chosen" MAE is
#      out-of-sample. Compared against the shipped weights and a single flat
#      0.5.
#   3. Cluster bootstrap over (season, week) -- the correlated unit -- for the
#      standard error of every weight's MAE and of "candidate minus shipped".
#   4. One-standard-error rule: among weights within 1 SE of the best, take
#      the one closest to the shipped value (don't move unless the data
#      clearly says to).
#   5. A weight change is only recommended if it beats shipped out-of-sample
#      in BOTH held-out seasons AND its bootstrap CI excludes zero.
#
# Players Sleeper has no projection for are excluded (as in the original
# harness) -- the "no Sleeper projection = OUT" rule is separate and not what
# this measures. Run: Rscript backtest_sleeper_blend_resweep.R

suppressMessages(library(nflreadr)); suppressMessages(library(jsonlite)); suppressMessages(library(httr))
EXCLUDE_WEEKS <- 18; TEST_SEASONS <- c(2024, 2025); TEST_WEEKS <- 3:17; LOOKBACK_YEARS <- 3
MED_DECAY <- c(RB = 0.87, QB = 0.90, WR = 0.89, TE = 0.92)
PASS_PTS_DECAY_QB <- 0.79; RUSH_PTS_DECAY_QB <- 0.88; MED_MEAN_BLEND_SHARE <- 0.85
SHIPPED <- c(QB = 0.5, RB = 0.2, WR = 0.4, TE = 0.4); GRID <- seq(0, 1, by = 0.1); POS <- c("QB","RB","WR","TE")
set.seed(42)
rw <- function(n, d) { w <- d^((n - 1):0); w / sum(w) }
wq <- function(x, w, q) { o <- order(x); x <- x[o]; w <- w[o]; cw <- (cumsum(w) - 0.5*w)/sum(w); as.numeric(approx(cw, x, q, rule = 2)$y) }
nm <- function(n) tolower(gsub("\\s+(jr|sr|ii|iii|iv|v)$", "", gsub("\\.", "", n), ignore.case = TRUE))

raw <- as.data.frame(load_player_stats(seasons = (min(TEST_SEASONS) - LOOKBACK_YEARS):max(TEST_SEASONS)))
reg <- raw[raw$season_type == "REG" & raw$position %in% POS & !(raw$week %in% EXCLUDE_WEEKS) & !is.na(raw$fantasy_points_ppr),
           c("player_display_name","position","season","week","fantasy_points_ppr","passing_yards","passing_tds","passing_interceptions","rushing_yards","rushing_tds")]
for (c in c("passing_yards","passing_tds","passing_interceptions","rushing_yards","rushing_tds")) reg[[c]][is.na(reg[[c]])] <- 0
reg$pass_pts <- 0.04*reg$passing_yards + 4*reg$passing_tds - 2*reg$passing_interceptions
reg$rush_pts <- 0.1*reg$rushing_yards + 6*reg$rushing_tds
reg <- reg[order(reg$player_display_name, reg$season, reg$week), ]

fetch_sl <- function(season, week) {
  u <- sprintf("https://api.sleeper.app/projections/nfl/%d/%d?season_type=regular&%s", season, week, paste0("position[]=", POS, collapse = "&"))
  res <- tryCatch(httr::GET(u, httr::timeout(20)), error = function(e) NULL)
  if (is.null(res) || httr::status_code(res) != 200) return(NULL)
  d <- tryCatch(jsonlite::fromJSON(httr::content(res, "text", encoding = "UTF-8"), simplifyDataFrame = FALSE), error = function(e) NULL)
  if (is.null(d) || !length(d)) return(NULL)
  o <- lapply(d, function(e) if (is.null(e$player) || is.null(e$stats$pts_ppr)) NULL else list(k = nm(paste(e$player$first_name, e$player$last_name)), p = e$stats$pts_ppr))
  o <- o[!sapply(o, is.null)]; setNames(sapply(o, `[[`, "p"), sapply(o, `[[`, "k"))
}

rows <- list()
for (s in TEST_SEASONS) for (wk in TEST_WEEKS) {
  sl <- fetch_sl(s, wk); if (is.null(sl)) next
  wa <- reg[reg$season == s & reg$week == wk, ]
  for (r in seq_len(nrow(wa))) {
    p <- wa$player_display_name[r]; pos <- wa$position[r]
    h <- reg[reg$player_display_name == p & (reg$season < s | (reg$season == s & reg$week < wk)) & reg$season >= s - LOOKBACK_YEARS, ]
    n <- nrow(h); if (n < 8) next
    k <- nm(p); if (!(k %in% names(sl))) next
    prod <- if (pos == "QB") sum(rw(n, PASS_PTS_DECAY_QB) * h$pass_pts) + sum(rw(n, RUSH_PTS_DECAY_QB) * h$rush_pts)
            else { w <- rw(n, MED_DECAY[[pos]]); MED_MEAN_BLEND_SHARE * wq(h$fantasy_points_ppr, w, 0.5) + (1 - MED_MEAN_BLEND_SHARE) * sum(w * h$fantasy_points_ppr) }
    rows[[length(rows) + 1]] <- data.frame(season = s, week = wk, pos = pos, actual = wa$fantasy_points_ppr[r], prod = prod, sleeper = sl[[k]])
  }
  cat("done", s, wk, "n =", length(rows), "\n"); flush(stdout())
}
d <- do.call(rbind, rows); d$cl <- paste(d$season, d$week); saveRDS(d, "backtest_sleeper_blend_resweep_rows.rds")
cat("\nn =", nrow(d), "player-weeks;", "production-median MAE", round(mean(abs(d$actual - d$prod)), 3), "| Sleeper MAE", round(mean(abs(d$actual - d$sleeper)), 3), "\n")

err <- function(x, w) abs(x$actual - (w * x$prod + (1 - w) * x$sleeper))
mae_by_w <- function(x) sapply(GRID, function(w) mean(err(x, w)))
cat("\n=== MAE by our-weight, per position and season (best marked *) ===\n")
cat(sprintf("%-8s %s\n", "", paste(sprintf("%5.1f", GRID), collapse = " ")))
for (p in POS) for (s in c(TEST_SEASONS, "both")) {
  x <- d[d$pos == p & (s == "both" | d$season == as.numeric(s)), ]; m <- mae_by_w(x)
  cat(sprintf("%-3s %-4s ", p, s), paste(sprintf("%5.3f%s", m, ifelse(m == min(m), "*", " ")), collapse = ""), "\n")
}

# cluster bootstrap over (season, week)
cls <- unique(d$cl); B <- 1000
boot_mae <- function(x, f) { # f: weight-vector per row -> mean abs err; returns B draws
  by <- split(seq_len(nrow(x)), x$cl)
  replicate(B, { pick <- sample(names(by), length(by), replace = TRUE); i <- unlist(by[pick]); mean(f(x[i, ])) })
}
cat("\n=== Cross-season validation + bootstrap (per position) ===\n")
res <- list(); pick_w <- c(); oos <- data.frame()
for (p in POS) {
  x <- d[d$pos == p, ]
  # 1-SE rule on the pooled data, anchored at the shipped weight
  m <- mae_by_w(x); best <- which.min(m)
  se <- sd(boot_mae(x, function(z) err(z, GRID[best])))
  within <- GRID[m <= m[best] + se]
  w1se <- within[which.min(abs(within - SHIPPED[[p]]))]
  # cross-season: choose on the other season, score held-out
  cs <- sapply(TEST_SEASONS, function(t) { tr <- x[x$season != t, ]; te <- x[x$season == t, ]; wc <- GRID[which.min(mae_by_w(tr))]; c(w = wc, cand = mean(err(te, wc)), ship = mean(err(te, SHIPPED[[p]])), flat = mean(err(te, 0.5))) })
  colnames(cs) <- paste0("hold", TEST_SEASONS)
  diff <- boot_mae(x, function(z) err(z, w1se) - err(z, SHIPPED[[p]]))
  cat(sprintf("\n%s (n=%d): pooled best w=%.1f (MAE %.3f, SE %.3f) | shipped %.1f MAE %.3f | 1-SE choice (nearest shipped): %.1f\n", p, nrow(x), GRID[best], m[best], se, SHIPPED[[p]], m[which(GRID == SHIPPED[[p]])], w1se))
  print(round(cs, 3))
  cat(sprintf("  candidate(%.1f) - shipped(%.1f) MAE: %+.4f, 95%% CI [%+.4f, %+.4f]\n", w1se, SHIPPED[[p]], mean(err(x, w1se) - err(x, SHIPPED[[p]])), quantile(diff, .025), quantile(diff, .975)))
  pick_w[p] <- w1se
}
cat("\n=== Overall out-of-sample (weights chosen on the other season) ===\n")
for (t in TEST_SEASONS) {
  te <- d[d$season == t, ]; tr <- d[d$season != t, ]
  cvw <- sapply(POS, function(p) GRID[which.min(mae_by_w(tr[tr$pos == p, ]))])
  f <- function(wv) mean(abs(te$actual - (wv[te$pos] * te$prod + (1 - wv[te$pos]) * te$sleeper)))
  cat(sprintf("held-out %d: shipped %.4f | flat 0.5 %.4f | cross-season-chosen %.4f (%s) | pure Sleeper %.4f | pure ours %.4f\n", t, f(SHIPPED), f(c(QB=.5,RB=.5,WR=.5,TE=.5)), f(cvw), paste(names(cvw), cvw, collapse = " "), mean(abs(te$actual - te$sleeper)), mean(abs(te$actual - te$prod))))
}
cat("\n1-SE-rule weights (pooled, nearest shipped within 1 SE of the best):", paste(names(pick_w), pick_w, collapse = "  "), "\n")
