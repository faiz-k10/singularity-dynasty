// Regression score: how many fantasy points per game a player is
// currently outperforming (positive) or underperforming (negative) their
// preseason projected rate, in-season. A large positive score flags a
// "hot start" candidate likely to cool off toward their projection over
// the rest of the season; a large negative score flags a "cold start"
// candidate likely to warm back up.
//
// Formula is deliberately the simple version -- currentPPG minus
// projectedPPG, no simulation involved -- not the more sophisticated
// "percentile rank within a simulated N-game distribution" version that
// was backtested alongside it. The simple version won head-to-head on
// real 2022-2025 season data (model/backtest_regression_metric.R):
// correlation with actual rest-of-season reversion was r=0.56 overall
// (0.52 QB / 0.52 RB / 0.61 WR / 0.62 TE) vs. r=0.50 for the simulated-
// percentile version, at every position, with no extra computation cost
// (no Monte Carlo run needed to score a player each week). The decile
// breakdown in that backtest was cleanly monotonic -- coldest-decile
// starts rebounded by 2.6 PPG on average over the rest of the season,
// hottest-decile starts cooled off by 3.9 PPG -- confirming this is a
// real, well-behaved signal, not noise.
//
// IMPORTANT: projectedPPG must be the player's recency-weighted MEAN
// per-game rate (same weighting used everywhere else in this codebase,
// e.g. weighted_mean() in projection_engine.R / the wopr/epa treatment),
// NOT season_median / GAMES_PER_SEASON. That's what backtest_regression_
// metric.R actually validated -- a bootstrapped season-total median
// divided by games played is a different (and unvalidated, for this
// specific purpose) number due to how resampled sums skew relative to a
// plain weighted average. If the only projected-rate figure available at
// call time is season_median/GAMES_PER_SEASON, treat this as an
// approximation, not the literal backtested formula.
//
// No data pipeline for real in-season actual production exists yet (see
// project notes) -- this is intentionally just the calculation, not
// wired to a data source or the UI. actualPoints is the caller's own
// array of real weekly fantasy-point totals for the games played so far
// this season.
export function computeRegressionScore(actualPoints, projectedPPG) {
  if (!Array.isArray(actualPoints) || actualPoints.length === 0) return null;
  if (typeof projectedPPG !== "number" || !Number.isFinite(projectedPPG)) return null;

  const gamesPlayed = actualPoints.length;
  const currentPPG = actualPoints.reduce((sum, p) => sum + p, 0) / gamesPlayed;
  const regressionScore = currentPPG - projectedPPG;

  return {
    gamesPlayed,
    currentPPG,
    projectedPPG,
    // Positive = outperforming projection (hot -- expect to cool off).
    // Negative = underperforming projection (cold -- expect to warm up).
    regressionScore,
  };
}
