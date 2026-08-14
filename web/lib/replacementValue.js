// Points over Replacement (POR): one number per player that folds floor/
// median/ceiling into a single composite score, then subtracts the
// average composite score of a handful of "replacement level" players at
// the same position -- the going rate for a warm body off the waiver
// wire, not a bench star. Answers "how much better/worse is this player
// than what you could get for free at his position," not just his raw
// median.
//
// Composite score weights median twice as heavily as floor/ceiling: the
// median is the single most likely outcome, floor/ceiling represent the
// range around it. For a roughly symmetric player this reduces to the
// median anyway; it only pulls the score away from the median for a
// player whose range is lopsided (high ceiling / thin floor, or the
// reverse).
function compositeScore(row) {
  return 0.25 * row.floor + 0.5 * row.median + 0.25 * row.ceiling;
}

// Replacement level per position -- the rank range a waiver wire
// realistically offers, given standard 2RB/3WR/1TE/1FLEX starting
// lineups (RB/WR get pushed further down the board than their raw
// starter count since they also absorb the FLEX spot). These are the
// 12-team, single-QB baseline ranks; computeReplacementValues scales
// them for other league sizes/QB formats below. Averaged across a
// handful of ranks (not just one) so one unusually good or bad player
// right at the cutoff doesn't swing the baseline.
const BASE_REPLACEMENT_START = { QB: 13, RB: 30, WR: 36, TE: 13 };
const REPLACEMENT_COUNT = 5;
const BASE_TEAMS = 12;

// teams: league size (10, 12, ...) -- every position's replacement rank
// scales with it proportionally, since a smaller league has fewer
// starting spots to fill at every position alike.
// superflex: a second, QB-eligible FLEX slot roughly doubles per-team QB
// demand (treated as an effective 2-QB requirement, same simplification
// the "Superflex" toggle name implies) -- RB/WR/TE demand is unaffected
// by the QB format, so only QB's window moves.
export function computeReplacementValues(poolRows, { teams = BASE_TEAMS, superflex = false } = {}) {
  const byPos = {};
  for (const row of poolRows) {
    (byPos[row.position] ??= []).push(row);
  }

  const porByName = {};
  for (const pos in byPos) {
    const ranked = [...byPos[pos]].sort((a, b) => compositeScore(b) - compositeScore(a));
    const base = BASE_REPLACEMENT_START[pos] || Math.max(1, ranked.length - REPLACEMENT_COUNT + 1);
    let start = Math.round(base * (teams / BASE_TEAMS));
    if (superflex && pos === "QB") start = Math.round(start * 2);
    start = Math.max(1, start);
    // Clamp so a thin position (fewer players published than the cutoff)
    // still has a real group to average instead of running off the end.
    const startIndex = Math.min(start - 1, Math.max(ranked.length - REPLACEMENT_COUNT, 0));
    const replacementGroup = ranked.slice(startIndex, startIndex + REPLACEMENT_COUNT);
    const baseline =
      replacementGroup.reduce((sum, p) => sum + compositeScore(p), 0) / (replacementGroup.length || 1);

    for (const player of ranked) {
      porByName[player.player_name] = compositeScore(player) - baseline;
    }
  }

  return porByName;
}
