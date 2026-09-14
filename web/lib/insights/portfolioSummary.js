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
// `profile` is a 5-way risk-profile split built from real sim floor/
// ceiling data (ceiling-to-floor ratio), weighted by roster slots --
// re-derived fresh on every save, so it moves the moment a trade changes
// the underlying roster. Bucket cutoffs are a reasonable escalating
// scale, not a backtested threshold (same "product judgment, not
// validated" honesty the model's own README uses for similar calls).
//
// This is NOT an age-based "young dynasty vs. rebuild" split -- that
// needs real per-player age/draft-capital data (model/player_meta.R is
// built but not yet published to Supabase, the same gap flagged for
// Team Analysis). Building an age dimension here from data that doesn't
// exist yet would mean faking it, which is worse than not having it.

const PROFILE_BUCKETS = [
  { key: "bedrock", label: "Bedrock", test: (ratio) => ratio < 1.2 },
  { key: "floorSafe", label: "Floor-Safe", test: (ratio) => ratio >= 1.2 && ratio < 1.5 },
  { key: "balanced", label: "Balanced", test: (ratio) => ratio >= 1.5 && ratio < 2.0 },
  { key: "ceilingChaser", label: "Ceiling Chaser", test: (ratio) => ratio >= 2.0 && ratio < 2.8 },
  { key: "boomBust", label: "Boom/Bust", test: (ratio) => ratio >= 2.8 },
];

const TOP_EXPOSURE_COUNT = 5;

export async function computePortfolioSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const totalSlots = list.reduce((s, r) => s + (r.teams || 0), 0);

  const topExposure = [...list]
    .sort((a, b) => (b.teams || 0) - (a.teams || 0))
    .slice(0, TOP_EXPOSURE_COUNT)
    .map((r) => ({ name: r.name, teams: r.teams, exposurePct: r.exposurePct }));

  const bucketSlots = Object.fromEntries(PROFILE_BUCKETS.map((b) => [b.key, 0]));
  let ratedSlots = 0;
  for (const r of list) {
    if (r.simFloor == null || r.simCeiling == null || r.simFloor <= 0) continue;
    ratedSlots += r.teams || 0;
    const ratio = r.simCeiling / r.simFloor;
    const bucket = PROFILE_BUCKETS.find((b) => b.test(ratio));
    bucketSlots[bucket.key] += r.teams || 0;
  }

  // Round every bucket but the last normally, let the last absorb
  // whatever's left -- guarantees the percentages sum to exactly 100 for
  // the stacked-bar visual instead of drifting off by a point or two
  // from independently rounding all five.
  let profile = null;
  if (ratedSlots > 0) {
    let used = 0;
    profile = PROFILE_BUCKETS.map((b, i) => {
      const pct =
        i === PROFILE_BUCKETS.length - 1
          ? 100 - used
          : Math.round((bucketSlots[b.key] / ratedSlots) * 100);
      used += pct;
      return { key: b.key, label: b.label, pct };
    });
  }

  return {
    totalPlayers: list.length,
    totalSlots,
    topExposure,
    profile,
  };
}
