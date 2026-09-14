# Prints the blend-sweep report from whatever backtest_checkpoint_*.rds
# files exist on disk -- a fallback for reading results even if
# backtest_vs_sleeper.R itself gets cut off before its own final summary
# block runs (checkpoints are written after each season completes).
#
# Run: Rscript backtest_vs_sleeper_report.R

BLEND_WEIGHTS <- seq(0, 1, by = 0.1)

ckpt_files <- list.files(".", pattern = "^backtest_checkpoint_\\d+\\.rds$")
if (length(ckpt_files) == 0) stop("No backtest_checkpoint_*.rds files found -- run backtest_vs_sleeper.R first.")
cat("Loading checkpoints:", paste(ckpt_files, collapse = ", "), "\n\n")

sleeper_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
model_err <- list(QB=c(), RB=c(), WR=c(), TE=c())
blend_err <- setNames(lapply(BLEND_WEIGHTS, function(w) list(QB=c(), RB=c(), WR=c(), TE=c())),
                       as.character(BLEND_WEIGHTS))

for (f in ckpt_files) {
  ck <- readRDS(f)
  for (pos in c("QB","RB","WR","TE")) {
    sleeper_err[[pos]] <- c(sleeper_err[[pos]], ck$sleeper_err[[pos]])
    model_err[[pos]] <- c(model_err[[pos]], ck$model_err[[pos]])
    for (w in BLEND_WEIGHTS) {
      wk <- as.character(w)
      blend_err[[wk]][[pos]] <- c(blend_err[[wk]][[pos]], ck$blend_err[[wk]][[pos]])
    }
  }
}

cat("=== FINAL: your model's core methodology vs. Sleeper's real projections ===\n")
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
