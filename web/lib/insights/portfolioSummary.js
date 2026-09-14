// Distilled, cacheable facts about a user's cross-league portfolio --
// NOT a replacement for lib/portfolio.js's buildPortfolio()/
// aggregateGames(), which stay exactly as they are: pure, synchronous,
// re-run on every filter click in MyAnalysisPanel. Persisting THAT
// (every filter change) would be the wrong shape for this layer -- what
// belongs here is a handful of stable summary facts, computed once when
// the My Team page loads with 2+ saved teams, cheap to read elsewhere
// later (a badge, a share card, a future achievement threshold) without
// re-deriving them from scratch.
//
// input: the `rows` array buildPortfolio() already produces -- My Team's
// page.js has this on hand for the My Guys panel, so this needs no new
// data fetch of its own.

const SPIKY_RATIO = 1.5; // ceiling at least 1.5x floor -> a "spiky" asset

export async function computePortfolioSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const totalSlots = list.reduce((s, r) => s + (r.teams || 0), 0);

  let top = null;
  for (const r of list) {
    if (!top || (r.teams || 0) > (top.teams || 0)) top = r;
  }

  let spikySlots = 0;
  let ratedSlots = 0;
  for (const r of list) {
    if (r.simFloor == null || r.simCeiling == null || r.simFloor <= 0) continue;
    ratedSlots += r.teams || 0;
    if (r.simCeiling / r.simFloor >= SPIKY_RATIO) spikySlots += r.teams || 0;
  }

  return {
    totalPlayers: list.length,
    totalSlots,
    topExposure: top ? { name: top.name, teams: top.teams, exposurePct: top.exposurePct } : null,
    spikyPct: ratedSlots > 0 ? Math.round((spikySlots / ratedSlots) * 100) : null,
  };
}
