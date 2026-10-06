# Player archetypes: groups players by ROLE (how his production is mixed and how big his
# workload is), not by how much he produces -- so "Derrick Henry" lands with other lead
# rushing backs, not with every mid-volume RB. Built on volume-neutral / workload features,
# PCA to a few role axes, then k-means on those axes.
#
# Two modes:
#   Rscript player_archetypes.R analyze     -- diagnostics for choosing the number of groups per position
#                                              (silhouette, stability, who lands where). Writes nothing.
#   Rscript player_archetypes.R fit         -- ONE-TIME: fits the groups and writes archetype_model.R (the
#                                              frozen scaling/PCA/centres + names). Commit that file.
#   Rscript player_archetypes.R             -- weekly: assigns every current player to the frozen groups
#                                              and writes upload_player_archetypes.csv. Cheap, deterministic,
#                                              definitions never drift week to week.
#
# Input window: the last two seasons of regular-season games (WINDOW_SEASONS), so a player's label is
# stable early in a season, when he only has a few games of the current one.
suppressMessages(library(nflreadr))

WINDOW_SEASONS <- function() { cur <- min(2026, most_recent_season()); (cur - 1):cur }
MIN_GAMES <- 4

# Per-position features and eligibility. All are per game or shares/rates -- nothing that is
# just "plays more".
ARCH_CONFIG <- list(
  RB = list(
    sum_cols = c("carries", "rushing_yards", "targets", "receiving_yards"),
    features = function(a) data.frame(
      rec_yd_share = a$receiving_yards / pmax(a$rushing_yards + a$receiving_yards, 1),
      target_per_touch = a$targets / pmax(a$carries + a$targets, 1),
      carries_pg = a$carries / a$games, targets_pg = a$targets / a$games),
    eligible = function(a) (a$carries + a$targets) >= 40),
  WR = list(
    sum_cols = c("targets", "receiving_yards", "receiving_air_yards", "receiving_yards_after_catch", "target_share_sum"),
    features = function(a) data.frame(
      targets_pg = a$targets / a$games, target_share = a$target_share_sum / a$games,
      adot = a$receiving_air_yards / pmax(a$targets, 1),
      yac_share = a$receiving_yards_after_catch / pmax(a$receiving_yards, 1)),
    eligible = function(a) a$targets >= 25),
  TE = list(
    sum_cols = c("targets", "receiving_yards", "receiving_air_yards", "receiving_yards_after_catch", "target_share_sum"),
    features = function(a) data.frame(
      targets_pg = a$targets / a$games, target_share = a$target_share_sum / a$games,
      adot = a$receiving_air_yards / pmax(a$targets, 1),
      yac_share = a$receiving_yards_after_catch / pmax(a$receiving_yards, 1)),
    eligible = function(a) a$targets >= 20),
  QB = list(
    sum_cols = c("attempts", "passing_yards", "passing_air_yards", "passing_yards_after_catch", "carries", "rushing_yards"),
    features = function(a) data.frame(
      attempts_pg = a$attempts / a$games, air_per_att = a$passing_air_yards / pmax(a$attempts, 1),
      carries_pg = a$carries / a$games, rush_yd_share = a$rushing_yards / pmax(a$rushing_yards + a$passing_yards, 1),
      yac_share = a$passing_yards_after_catch / pmax(a$passing_yards, 1)),
    eligible = function(a) a$attempts >= 60)
)

load_window <- function() {
  s <- as.data.frame(load_player_stats(seasons = WINDOW_SEASONS()))
  s <- s[s$season_type == "REG" & s$position %in% names(ARCH_CONFIG), ]
  s$target_share_sum <- ifelse(is.na(s$target_share), 0, s$target_share)
  s
}

# One row per player: summed counting stats + games, then the position's features.
player_features <- function(s, pos, only_names = NULL, min_games = MIN_GAMES) {
  cfg <- ARCH_CONFIG[[pos]]
  x <- s[s$position == pos, ]
  if (!is.null(only_names)) x <- x[x$player_display_name %in% only_names, ]
  if (nrow(x) == 0) return(NULL)
  cols <- intersect(cfg$sum_cols, names(x))
  a <- aggregate(x[, cols, drop = FALSE], by = list(player = x$player_display_name), FUN = function(v) sum(v, na.rm = TRUE))
  a$games <- as.vector(table(x$player_display_name)[a$player])
  a <- a[a$games >= min_games & cfg$eligible(a), ]
  if (nrow(a) == 0) return(NULL)
  f <- cfg$features(a); rownames(f) <- a$player; f
}

# ---- frozen-model helpers (the fit stores mu/sd/rotation/centres; assignment is just arithmetic) ----
zs <- function(fx, mu, sdv) sweep(sweep(as.matrix(fx[, names(mu), drop = FALSE]), 2, mu, "-"), 2, sdv, "/")
project <- function(fx, m) (zs(fx, m$mu, m$sd) %*% m$rotation)[, seq_len(ncol(m$centers)), drop = FALSE]
assign_groups <- function(fx, m) {
  Z <- project(fx, m)
  d <- t(apply(Z, 1, function(z) colSums((t(m$centers) - z)^2)))   # distance^2 to every centre
  o <- t(apply(d, 1, order))
  best <- o[, 1]; second <- o[, 2]
  data.frame(player = rownames(fx), group = best, runner_up = second,
             # 0 = sitting on the boundary with the runner-up group, 1 = deep inside his own group
             confidence = round((sqrt(d[cbind(seq_len(nrow(d)), second)]) - sqrt(d[cbind(seq_len(nrow(d)), best)])) /
                                  (sqrt(d[cbind(seq_len(nrow(d)), second)]) + sqrt(d[cbind(seq_len(nrow(d)), best)]) + 1e-9), 2),
             stringsAsFactors = FALSE)
}
fit_model <- function(f, k, n_pc = 2, seed = 1) {
  mu <- colMeans(f); sdv <- apply(f, 2, sd)
  p <- prcomp(sweep(sweep(as.matrix(f), 2, mu, "-"), 2, sdv, "/"))
  X <- p$x[, seq_len(n_pc), drop = FALSE]
  set.seed(seed); km <- kmeans(X, k, nstart = 200, algorithm = "Lloyd", iter.max = 200)
  list(mu = mu, sd = sdv, rotation = p$rotation, centers = km$centers, var_share = summary(p)$importance[2, seq_len(n_pc)])
}
silhouette_of <- function(X, cl) {
  dm <- as.matrix(dist(X))
  mean(sapply(seq_along(cl), function(i) {
    same <- cl == cl[i]; ai <- if (sum(same) > 1) sum(dm[i, same]) / (sum(same) - 1) else 0
    b <- min(sapply(setdiff(unique(cl), cl[i]), function(c2) mean(dm[i, cl == c2]))); (b - ai) / max(ai, b) }))
}

pool_names <- function(pos) {   # the players the site shows: the current Player Simulations pool (from the last published upload)
  f <- "upload_player_simulations.csv"
  if (!file.exists(f)) return(NULL)
  u <- read.csv(f, stringsAsFactors = FALSE); unique(u$player_name[u$position == pos])
}

analyze <- function() {
  s <- load_window()
  for (pos in names(ARCH_CONFIG)) {
    f <- player_features(s, pos, pool_names(pos))
    if (is.null(f) || nrow(f) < 12) { cat("\n=====", pos, ": too few players\n"); next }
    cat(sprintf("\n==================== %s: %d players ====================\n", pos, nrow(f)))
    sil <- sapply(3:6, function(k) { m <- fit_model(f, k); X <- project(f, m); silhouette_of(X, assign_groups(f, m)$group) })
    cat("cleanliness of grouping (silhouette):", paste(sprintf("k=%d %.2f", 3:6, sil), collapse = " | "), "\n")
    for (k in 3:5) {
      m <- fit_model(f, k); g <- assign_groups(f, m)$group; names(g) <- rownames(f)
      st <- sapply(list(odd = s[s$week %% 2 == 1, ], even = s[s$week %% 2 == 0, ]), function(x) {
        fx <- player_features(x, pos, rownames(f), 3); if (is.null(fx)) return(NA)
        a <- assign_groups(fx, m); mean(a$group == g[a$player]) })
      cat(sprintf("k=%d stability (same group from half the games): odd %.0f%% / even %.0f%%   sizes: %s\n", k, 100 * st[1], 100 * st[2], paste(sort(table(g), decreasing = TRUE), collapse = "/")))
    }
  }
}

# ---- fit (one time) -------------------------------------------------------------------------
# Groups per position (chosen in the analysis: best cleanliness/stability for the number of types
# that read as distinct roles). QB is deliberately not here yet -- its groups did not pass the eye
# test (Lamar Jackson / Jalen Hurts did not land with the mobile QBs).
ARCH_K <- c(RB = 4, WR = 4, TE = 3)

# Names are attached by rule from each group's average profile (never by cluster number), so a refit
# can't swap two labels. Every position's rule must hand out each name exactly once.
name_groups <- function(pos, cent) {
  idx <- seq_len(nrow(cent)); lab <- character(nrow(cent))
  pick <- function(pool, col, fun = which.max) pool[fun(cent[pool, col])]
  if (pos == "RB") {
    r <- pick(idx, "rec_yd_share"); lab[r] <- "Receiving Back"; rest <- setdiff(idx, r)
    d <- pick(rest, "targets_pg"); lab[d] <- "Dual-Threat Workhorse"; rest <- setdiff(rest, d)
    l <- pick(rest, "carries_pg"); lab[l] <- "Lead Back"; rest <- setdiff(rest, l)
    lab[rest] <- "Rotational Rusher"
  } else if (pos == "WR") {
    a <- pick(idx, "targets_pg"); lab[a] <- "Target Alpha"; rest <- setdiff(idx, a)
    sl <- pick(rest, "yac_share"); lab[sl] <- "Slot / YAC Receiver"; rest <- setdiff(rest, sl)
    dp <- pick(rest, "targets_pg", which.min); lab[dp] <- "Deep-Threat Depth"; rest <- setdiff(rest, dp)
    lab[rest] <- "Outside Starter"
  } else if (pos == "TE") {
    o <- order(cent[, "targets_pg"], decreasing = TRUE); lab[o] <- c("Featured Receiving TE", "Balanced TE", "Low-Volume TE")
  }
  stopifnot(!any(lab == ""), !any(duplicated(lab)))
  lab
}

fit_all <- function() {
  s <- load_window(); out <- list()
  for (pos in names(ARCH_K)) {
    f <- player_features(s, pos, pool_names(pos)); m <- fit_model(f, ARCH_K[[pos]])
    a <- assign_groups(f, m); g <- a$group
    cent <- do.call(rbind, lapply(seq_len(nrow(m$centers)), function(i) colMeans(f[g == i, , drop = FALSE])))
    m$labels <- name_groups(pos, cent)
    cat(sprintf("\n===== %s: %d players, %d groups =====\n", pos, nrow(f), length(m$labels)))
    for (i in order(cent[, 1], decreasing = TRUE)) cat(sprintf("%-24s (%2d)  %s\n    %s\n", m$labels[i], sum(g == i),
        paste(sprintf("%s %.2f", colnames(cent), cent[i, ]), collapse = " | "), paste(head(rownames(f)[g == i][order(-f[g == i, 1])], 10), collapse = ", ")))
    out[[pos]] <- m
  }
  txt <- c("# GENERATED by `Rscript player_archetypes.R fit` -- do not edit by hand. The frozen scaling, PCA axes and",
           "# group centres (plus each group's name) used by the weekly archetype assignment. Refit only if the",
           "# features or the number of groups change; a refit can move players between groups.",
           paste0("ARCHETYPE_MODEL <- ", paste(deparse(out, control = c("keepNA", "keepInteger", "niceNames", "showAttributes", "digits17")), collapse = "\n")))
  writeLines(txt, "archetype_model.R")
  cat("\nWrote archetype_model.R\n")
}

# ---- weekly assignment ----------------------------------------------------------------------
# Assigns every eligible player in the current Player Sims pool to his position's frozen groups.
# `confidence` is 0 on a group boundary and 1 deep inside the group; `runner_up` is the next-closest group.
assign_weekly <- function() {
  if (!file.exists("archetype_model.R")) stop("archetype_model.R not found -- run `Rscript player_archetypes.R fit` once first")
  source("archetype_model.R")
  sims <- read.csv("upload_player_simulations.csv", stringsAsFactors = FALSE)
  season <- sims$season[1]; week <- sims$week[1]
  s <- load_window(); rows <- list()
  for (pos in names(ARCHETYPE_MODEL)) {
    m <- ARCHETYPE_MODEL[[pos]]
    f <- player_features(s, pos, sims$player_name[sims$position == pos])
    if (is.null(f)) next
    a <- assign_groups(f, m)
    rows[[pos]] <- data.frame(season = season, week = week, player_name = a$player, position = pos,
                              archetype = m$labels[a$group], runner_up = m$labels[a$runner_up], confidence = a$confidence, stringsAsFactors = FALSE)
  }
  out <- do.call(rbind, rows)
  write.csv(out, "upload_player_archetypes.csv", row.names = FALSE)
  cat(sprintf("Wrote upload_player_archetypes.csv: %d players (season %s, week %s)\n", nrow(out), season, week))
  print(table(out$position, out$archetype))
}

if (sys.nframe() == 0) {
  mode <- commandArgs(trailingOnly = TRUE)[1]
  if (identical(mode, "analyze")) analyze() else if (identical(mode, "fit")) fit_all() else assign_weekly()
}
