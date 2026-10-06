// Outcome percentile: if a player kept up their current in-season pace
// for a full season, where would that land on their own floor-to-ceiling
// simulated outcome curve? Answers "how extreme is this player's current
// pace relative to what we thought was plausible for him," on the same
// 0-100 scale the site already uses for floor(10th)/median(50th)/
// ceiling(90th).
//
// Extrapolates the pace across a full season, then linearly interpolates a
// percentile from the
// three known points on the simulated distribution -- floor=10,
// median=50, ceiling=90 -- the same "linearly interpolated quantile"
// approach projection_engine.R already uses elsewhere (weighted_quantile()
// there interpolates between known quantiles rather than snapping to the
// nearest one), just inverted here: given a value, find its percentile,
// instead of given a percentile, find its value.
//
// Beyond the floor or ceiling, the nearest segment's slope is extended
// rather than snapping flat, but clamped to [1, 99] -- a pace far outside
// the simulated floor/ceiling should still read as extreme (not
// literally 0th/100th, which would overclaim precision this model
// doesn't have at the true tails).
//
// Pace = points scored so far / games the player's TEAM has played * the
// season length. Dividing by the team's games (not just the games the
// player appeared in) means missed games drag the pace down, the same way
// they already pull the simulated floor/median/ceiling down -- otherwise a
// player who has missed games shows a pace marker frozen at his per-game
// rate while the range he is plotted against slides below it. When the
// caller doesn't know the team's games, it falls back to games played.
function interpolate(value, x0, y0, x1, y1) {
  if (x1 === x0) return y0;
  return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
}

export function computeOutcomePercentile(actualPoints, { floor, median, ceiling, gamesPerSeason, gamesElapsed }) {
  if (!Array.isArray(actualPoints) || actualPoints.length === 0) return null;
  if (![floor, median, ceiling, gamesPerSeason].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return null;
  }

  const gamesPlayed = actualPoints.length;
  const total = actualPoints.reduce((sum, p) => sum + p, 0);
  const currentPPG = total / gamesPlayed;
  const elapsed =
    typeof gamesElapsed === "number" && Number.isFinite(gamesElapsed) && gamesElapsed > 0
      ? Math.max(gamesElapsed, gamesPlayed)
      : gamesPlayed;
  const paceSeasonTotal = (total / elapsed) * gamesPerSeason;

  const percentile = Math.min(
    99,
    Math.max(
      1,
      paceSeasonTotal <= median
        ? interpolate(paceSeasonTotal, floor, 10, median, 50)
        : interpolate(paceSeasonTotal, median, 50, ceiling, 90)
    )
  );

  return { gamesPlayed, currentPPG, paceSeasonTotal, percentile };
}
