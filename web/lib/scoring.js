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

// Per-component point contributions -- computeCustomProjection sums these
// (see below); computeProjectionBreakdown (Redraft's "how was this built"
// row) exposes the same array directly so the displayed subtotal is
// mechanically the sum of the rows shown above it, not two independently-
// maintained calculations that could drift apart.
const STAT_LABELS = {
  passing_yards: "Passing yards",
  passing_tds: "Passing TDs",
  passing_interceptions: "Interceptions",
  rushing_yards: "Rushing yards",
  rushing_tds: "Rushing TDs",
  receiving_yards: "Receiving yards",
  receiving_tds: "Receiving TDs",
  receptions: "Receptions",
};

function breakdownEntries(stats, position, settings) {
  if (!stats) return [];
  const receptionRate = PPR_RATE[settings.ppr] + (position === "TE" ? settings.tePremium : 0);
  const rateByStat = {
    passing_yards: PASSING_YARD_RATE,
    passing_tds: PASSING_TD_POINTS,
    passing_interceptions: INTERCEPTION_POINTS,
    rushing_yards: RUSH_RECEIVE_YARD_RATE,
    rushing_tds: RUSH_RECEIVE_TD_POINTS,
    receiving_yards: RUSH_RECEIVE_YARD_RATE,
    receiving_tds: RUSH_RECEIVE_TD_POINTS,
    receptions: receptionRate,
  };
  const entries = [];
  for (const [key, rate] of Object.entries(rateByStat)) {
    const rawValue = stats[key];
    if (rawValue == null) continue;
    entries.push({ key, label: STAT_LABELS[key], rawValue, rate, points: rate * rawValue });
  }
  return entries;
}

export function computeCustomProjection(stats, position, settings) {
  if (!stats) return null;
  const points = breakdownEntries(stats, position, settings).reduce((sum, e) => sum + e.points, 0);
  return Math.round(points * 10) / 10;
}

// Redraft's per-player stat breakdown ("what's this projection built
// from"). `subtotal` is the sum of `entries`' own points, rounded the
// same way computeCustomProjection rounds its total -- deliberately NOT
// forced to equal the row's displayed `projection`, which comes from
// projection_engine.R's weighted MEDIAN of real weekly point totals, not
// a sum of these weighted-MEAN per-stat components. Median-of-a-sum and
// sum-of-means are different statistics and don't converge in general;
// the gap is real and structural, not a rounding bug -- surfaced to the
// user, not hidden by fudging one number to match the other.
export function computeProjectionBreakdown(stats, position, settings) {
  const entries = breakdownEntries(stats, position, settings);
  const subtotal = Math.round(entries.reduce((sum, e) => sum + e.points, 0) * 10) / 10;
  return { entries, subtotal };
}
