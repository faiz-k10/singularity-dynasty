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
// `tabs` adds four more slot-weighted views (age, position, production,
// badges) -- see buildTabs. Age comes from Sleeper's player dictionary
// (attached to rows by the caller), not from model/player_meta.R.

const PROFILE_BUCKETS = [
  { key: "bedrock", label: "Bedrock", test: (ratio) => ratio < 1.2 },
  { key: "floorSafe", label: "Floor-Safe", test: (ratio) => ratio >= 1.2 && ratio < 1.5 },
  { key: "balanced", label: "Balanced", test: (ratio) => ratio >= 1.5 && ratio < 2.0 },
  { key: "ceilingChaser", label: "Ceiling Chaser", test: (ratio) => ratio >= 2.0 && ratio < 2.8 },
  { key: "boomBust", label: "Boom/Bust", test: (ratio) => ratio >= 2.8 },
];

// Largest-remainder rounding (Hamilton's method): floor every bucket's
// exact share, then hand out the few leftover points (100 minus the sum of
// the floors, always a small non-negative number) to whichever buckets had
// the biggest fractional part rounded away. Guarantees every bucket is >= 0
// and they sum to exactly 100 -- the earlier "last bucket absorbs the
// remainder" approach could go NEGATIVE whenever the independently-rounded
// shares already summed past 100 (caught live: Bedrock 0 / Floor-Safe 28 /
// Balanced 56 / Ceiling Chaser 17 summed to 101, so Boom/Bust rendered -1%).
function toPercents(counts) {
  const total = counts.reduce((s, v) => s + v, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map(Math.floor);
  const remainder = 100 - floors.reduce((s, v) => s + v, 0);
  const order = floors
    .map((_, i) => i)
    .sort((a, c) => (exact[c] - floors[c]) - (exact[a] - floors[a]));
  const pcts = [...floors];
  for (let i = 0; i < remainder; i++) pcts[order[i]] += 1;
  return pcts;
}

// Extra Portfolio Pulse tabs. Every tab counts each DISTINCT player once (a
// snapshot of who is in your portfolio, not how heavily you own them) and
// reports how many players it could actually classify (`rated` of `total`) -- players missing the
// needed field are left out rather than guessed. Cutoffs are product
// judgment, not backtested.
//   age        -> row.age (Sleeper player dictionary)
//   position   -> row.position
//   badges     -> row.badges: achievement keys the player carries (Established /
//                 Building are the confidence badges and are excluded by the
//                 caller); counted once per player, shown as counts not shares
//   production -> row.myProjPts (our model's weekly projection) vs
//                 position-specific cutoffs; a 0 projection means OUT and is
//                 unrated rather than "depth"
const AGE_BANDS = [
  { key: "rising", label: "Rising (\u226423)", test: (a) => a <= 23 },
  { key: "prime", label: "Prime (24\u201327)", test: (a) => a >= 24 && a <= 27 },
  { key: "veteran", label: "Veteran (28\u201330)", test: (a) => a >= 28 && a <= 30 },
  { key: "aging", label: "Aging (31+)", test: (a) => a >= 31 },
];
// Achievement badges the Badges tab counts, in display order (Weekly Hero,
// Buy Low / Sell High, Risky Icarus / Steady Eddy, then the rest; keys match app/tools/
// achievements.js getAchievements; the confidence badge -- Established /
// Building -- is deliberately not counted).
const BADGES = [
  { key: "hero", label: "Weekly Hero" },
  { key: "buyLow", label: "Buy Low" },
  { key: "sellHigh", label: "Sell High" },
  { key: "volatile", label: "Risky Icarus" },
  { key: "locked", label: "Steady Eddy" },
  { key: "onFire", label: "On Fire" },
  { key: "onIce", label: "On Thin Ice" },
  { key: "honorable", label: "Honorable" },
  { key: "conArtist", label: "Con Artist" },
];
const POSITIONS = ["QB", "RB", "WR", "TE"];
const PRODUCTION_TIERS = [
  { key: "elite", label: "Elite" },
  { key: "strong", label: "Strong" },
  { key: "mid", label: "Mid" },
  { key: "depth", label: "Depth" },
];
// [elite, strong, mid] weekly-projection floors per position; below mid = depth.
const PRODUCTION_CUTS = { QB: [20, 15, 10], RB: [16, 11, 7], WR: [16, 11, 7], TE: [12, 8, 5] };

function tab(key, label, title, buckets, counts, rated, total) {
  const pcts = toPercents(counts);
  return {
    key,
    label,
    title,
    rated,
    total,
    buckets: rated > 0 ? buckets.map((b, i) => ({ key: b.key, label: b.label, pct: pcts[i], slots: counts[i] })) : null,
  };
}

// Badge count: raw counts per badge (a player on 3 teams adds 3), only badges
// that appear; bar widths are each badge's share of all badges earned.
function badgeTab(counts) {
  const earned = BADGES.map((b, i) => ({ ...b, slots: counts[i] })).filter((b) => b.slots > 0);
  const totalBadges = earned.reduce((s, b) => s + b.slots, 0);
  const pcts = toPercents(earned.map((b) => b.slots));
  return {
    key: "badges",
    label: "Badges",
    title: "Badge count",
    unit: "badges",
    rated: totalBadges,
    total: null,
    buckets: earned.map((b, i) => ({ key: b.key, label: b.label, pct: pcts[i], slots: b.slots })),
  };
}

function buildTabs(list) {
  const total = list.length;

  const ageCounts = AGE_BANDS.map(() => 0);
  const posCounts = POSITIONS.map(() => 0);
  const prodCounts = PRODUCTION_TIERS.map(() => 0);
  const badgeCounts = BADGES.map(() => 0);

  for (const r of list) {
    const n = 1; // each player counts once, however many of your teams roster him
    if (typeof r.age === "number" && r.age > 0) {
      const i = AGE_BANDS.findIndex((b) => b.test(r.age));
      if (i >= 0) ageCounts[i] += n;
    }
    const pi = POSITIONS.indexOf(r.position);
    if (pi >= 0) posCounts[pi] += n;

    for (const k of r.badges || []) {
      const bi = BADGES.findIndex((b) => b.key === k);
      if (bi >= 0) badgeCounts[bi] += n;
    }

    const cuts = PRODUCTION_CUTS[r.position];
    if (cuts && typeof r.myProjPts === "number" && r.myProjPts > 0) {
      const tier = r.myProjPts >= cuts[0] ? 0 : r.myProjPts >= cuts[1] ? 1 : r.myProjPts >= cuts[2] ? 2 : 3;
      prodCounts[tier] += n;
    }
  }
  const sum = (a) => a.reduce((s, v) => s + v, 0);

  return [
    tab("age", "Age", "Age profile", AGE_BANDS, ageCounts, sum(ageCounts), total),
    tab("position", "Position", "Position mix", POSITIONS.map((p) => ({ key: p.toLowerCase(), label: p })), posCounts, sum(posCounts), total),
    tab("production", "Production", "Production tier", PRODUCTION_TIERS, prodCounts, sum(prodCounts), total),
    badgeTab(badgeCounts),
  ];
}

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

  const profile = ratedSlots > 0
    ? PROFILE_BUCKETS.map((b, i) => ({
        key: b.key,
        label: b.label,
        pct: toPercents(PROFILE_BUCKETS.map((x) => bucketSlots[x.key]))[i],
      }))
    : null;

  const tabs = buildTabs(list);

  return {
    totalPlayers: list.length,
    totalSlots,
    topExposure,
    profile,
    tabs,
  };
}
