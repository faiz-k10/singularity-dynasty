// Regression score ("vs pace"): how many total fantasy points a player is
// currently ahead of (positive) or behind (negative) the pace their season
// projection implied through the games his TEAM has played so far -- i.e.
// real cumulative points minus (projectedPPG * team games played). A large
// positive score flags a "hot start" candidate likely to cool off toward
// their projection over the rest of the season; a large negative score
// flags a "cold start" (or a player who has missed games).
//
// Counting the team's games, not just the games he appeared in, keeps this
// on the same footing as the pace marker and the floor/median/ceiling bar it
// is read next to: the projection's season median already prices in missed
// games, so a score that only looked at games played would read "ahead of
// pace" for a player whose bar had slid down because he was out. For a
// player who has played every team game the two are identical, so nothing
// changes for healthy players. The sign always matches the pace marker
// (above the median <=> positive).
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
export function computeRegressionScore(actualPoints, projectedPPG, gamesElapsed) {
  if (!Array.isArray(actualPoints) || actualPoints.length === 0) return null;
  if (typeof projectedPPG !== "number" || !Number.isFinite(projectedPPG)) return null;

  const gamesPlayed = actualPoints.length;
  const actualTotal = actualPoints.reduce((sum, p) => sum + p, 0);
  const currentPPG = actualTotal / gamesPlayed;
  // Games his team has played (never fewer than he did); falls back to games
  // played when the caller doesn't know.
  const elapsed =
    typeof gamesElapsed === "number" && Number.isFinite(gamesElapsed) && gamesElapsed > 0
      ? Math.max(gamesElapsed, gamesPlayed)
      : gamesPlayed;
  const regressionScore = actualTotal - projectedPPG * elapsed;

  return {
    gamesPlayed,
    gamesElapsed: elapsed,
    currentPPG,
    projectedPPG,
    // Positive = ahead of pace (hot -- expect to cool off).
    // Negative = behind pace (cold -- expect to warm up).
    // In total points scored so far vs. pace, not points per game.
    regressionScore,
  };
}
