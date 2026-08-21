// Custom scoring for Redraft Rankings -- recomputes a player's projection
// from their raw weekly component stats (redraft_rankings.scoring_stats,
// a weighted-mean reconstruction, see projection_engine.R) under a
// visitor's own league settings, instead of the single fixed-scoring
// `projection` column. Passing/rushing/receiving YARDAGE rates are not
// user-configurable (no site copy asked for that) -- only the two
// settings below vary. Passing TD/interception points were briefly
// configurable too but that UI was removed by request; kept fixed at
// their old default rates here rather than reintroducing a hardcoded
// 4/-2 duplicate elsewhere.

export const DEFAULT_SCORING_SETTINGS = {
  ppr: "full", // "full" | "half" | "standard"
  tePremium: 0, // 0 | 0.5 | 1
};

const PPR_RATE = { full: 1, half: 0.5, standard: 0 };

export function isDefaultScoring(settings) {
  return (
    settings.ppr === DEFAULT_SCORING_SETTINGS.ppr &&
    settings.tePremium === DEFAULT_SCORING_SETTINGS.tePremium
  );
}

// Fixed (non-configurable) per-unit rates -- standard across every
// mainstream scoring format.
const PASSING_YARD_RATE = 0.04; // 1pt / 25 yards
const PASSING_TD_POINTS = 4;
const INTERCEPTION_POINTS = -2;
const RUSH_RECEIVE_YARD_RATE = 0.1; // 1pt / 10 yards
const RUSH_RECEIVE_TD_POINTS = 6;

export function computeCustomProjection(stats, position, settings) {
  if (!stats) return null;
  const receptionRate = PPR_RATE[settings.ppr] + (position === "TE" ? settings.tePremium : 0);
  let points = 0;
  if (stats.passing_yards != null) points += PASSING_YARD_RATE * stats.passing_yards;
  if (stats.passing_tds != null) points += PASSING_TD_POINTS * stats.passing_tds;
  if (stats.passing_interceptions != null) points += INTERCEPTION_POINTS * stats.passing_interceptions;
  if (stats.rushing_yards != null) points += RUSH_RECEIVE_YARD_RATE * stats.rushing_yards;
  if (stats.rushing_tds != null) points += RUSH_RECEIVE_TD_POINTS * stats.rushing_tds;
  if (stats.receiving_yards != null) points += RUSH_RECEIVE_YARD_RATE * stats.receiving_yards;
  if (stats.receiving_tds != null) points += RUSH_RECEIVE_TD_POINTS * stats.receiving_tds;
  if (stats.receptions != null) points += receptionRate * stats.receptions;
  return Math.round(points * 10) / 10;
}
