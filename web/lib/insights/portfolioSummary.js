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
//
// `profile` is a 3-way risk-profile split (Ceiling Chaser / Balanced /
// Floor-Safe) built from real sim floor/ceiling data, weighted by roster
// slots -- re-derived fresh on every save, so it moves the moment a
// trade changes the underlying roster, same as every other insight.
// It is NOT an age-based "young dynasty vs. rebuild" split, on purpose:
// that needs real per-player age/draft-capital data (model/player_meta.R
// is built but not yet published to Supabase -- the same gap flagged for
// Team Analysis). Building an age dimension here from data that doesn't
// exist yet would mean faking it, which is worse than not having it.

const PROFILE_BUCKETS = [
  { key: "floorSafe", label: "Floor-Safe", test: (ratio) => ratio < 1.3 },
  { key: "balanced", label: "Balanced", test: (ratio) => ratio >= 1.3 && ratio < 2.0 },
  { key: "ceilingChaser", label: "Ceiling Chaser", test: (ratio) => ratio >= 2.0 },
];

export async function computePortfolioSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const totalSlots = list.reduce((s, r) => s + (r.teams || 0), 0);

  let top = null;
  for (const r of list) {
    if (!top || (r.teams || 0) > (top.teams || 0)) top = r;
  }

  const bucketSlots = { floorSafe: 0, balanced: 0, ceilingChaser: 0 };
  let ratedSlots = 0;
  for (const r of list) {
    if (r.simFloor == null || r.simCeiling == null || r.simFloor <= 0) continue;
    ratedSlots += r.teams || 0;
    const ratio = r.simCeiling / r.simFloor;
    const bucket = PROFILE_BUCKETS.find((b) => b.test(ratio));
    bucketSlots[bucket.key] += r.teams || 0;
  }

  // Round the first two buckets normally, let the third absorb the
  // remainder -- guarantees the three percentages actually sum to 100
  // for the stacked-bar visual instead of drifting off by a point or two
  // from independent rounding.
  let profile = null;
  if (ratedSlots > 0) {
    const floorSafePct = Math.round((bucketSlots.floorSafe / ratedSlots) * 100);
    const balancedPct = Math.round((bucketSlots.balanced / ratedSlots) * 100);
    const ceilingChaserPct = 100 - floorSafePct - balancedPct;
    profile = [
      { key: "floorSafe", label: "Floor-Safe", pct: floorSafePct },
      { key: "balanced", label: "Balanced", pct: balancedPct },
      { key: "ceilingChaser", label: "Ceiling Chaser", pct: ceilingChaserPct },
    ];
  }

  return {
    totalPlayers: list.length,
    totalSlots,
    topExposure: top ? { name: top.name, teams: top.teams, exposurePct: top.exposurePct } : null,
    profile,
  };
}
