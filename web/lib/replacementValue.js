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

// Replacement level per position -- the rank range a 12-team single-QB
// league's waiver wire realistically offers, given standard 1QB/2RB/3WR/
// 1TE/1FLEX starting lineups (RB/WR get pushed further down the board
// than their raw starter count since they also absorb the FLEX spot).
// Averaged across a handful of ranks (not just one) so one unusually
// good or bad player right at the cutoff doesn't swing the baseline.
const REPLACEMENT_RANK = {
  QB: { start: 13, count: 5 },
  RB: { start: 30, count: 5 },
  WR: { start: 36, count: 5 },
  TE: { start: 13, count: 5 },
};

export function computeReplacementValues(poolRows) {
  const byPos = {};
  for (const row of poolRows) {
    (byPos[row.position] ??= []).push(row);
  }

  const porByName = {};
  for (const pos in byPos) {
    const ranked = [...byPos[pos]].sort((a, b) => compositeScore(b) - compositeScore(a));
    const cfg = REPLACEMENT_RANK[pos] || { start: Math.max(1, ranked.length - 4), count: 5 };
    // Clamp so a thin position (fewer players published than the cutoff)
    // still has a real group to average instead of running off the end.
    const startIndex = Math.min(cfg.start - 1, Math.max(ranked.length - cfg.count, 0));
    const replacementGroup = ranked.slice(startIndex, startIndex + cfg.count);
    const baseline =
      replacementGroup.reduce((sum, p) => sum + compositeScore(p), 0) / (replacementGroup.length || 1);

    for (const player of ranked) {
      porByName[player.player_name] = compositeScore(player) - baseline;
    }
  }

  return porByName;
}
