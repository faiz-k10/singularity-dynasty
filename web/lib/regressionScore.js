// Regression score: how many total fantasy points a player is currently
// ahead of (positive) or behind (negative) the pace their preseason
// projection implied for the games they've actually played so far --
// i.e. real cumulative points minus (projectedPPG * gamesPlayed). A
// large positive score flags a "hot start" candidate likely to cool off
// toward their projection over the rest of the season; a large negative
// score flags a "cold start" candidate likely to warm back up.
//
// This is a POINTS-TOTAL rescaling of the underlying per-game signal
// (regressionScore == (currentPPG - projectedPPG) * gamesPlayed), by
// request -- displays as a bigger, more visceral number than the PPG
// gap. Two things worth knowing about that rescaling:
//   - It's a straight per-player linear transform of the exact formula
//     backtested in model/backtest_regression_metric.R (r=0.56 overall
//     vs real rest-of-season reversion, cleanly monotonic by decile --
//     see that script/lib/regressionScore.js's prior version for the
//     validation detail), so the underlying predictive signal is
//     unchanged.
//   - It is NOT comparable across players with different games-played
//     counts the way the PPG version was -- a player 2 games in and a
//     player 8 games in can show similar total-point gaps while being
//     hot/cold to very different degrees on a per-game basis. Read this
//     as "how many points ahead/behind pace," not as a normalized
//     ranking signal across the whole player pool.
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
  const actualTotal = actualPoints.reduce((sum, p) => sum + p, 0);
  const currentPPG = actualTotal / gamesPlayed;
  const regressionScore = actualTotal - projectedPPG * gamesPlayed;

  return {
    gamesPlayed,
    currentPPG,
    projectedPPG,
    // Positive = ahead of pace (hot -- expect to cool off).
    // Negative = behind pace (cold -- expect to warm up).
    // In total points scored so far vs. pace, not points per game.
    regressionScore,
  };
}
