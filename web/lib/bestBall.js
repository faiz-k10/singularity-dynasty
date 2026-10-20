// Best ball: Sleeper only fills in a team's best-ball lineup late (its live `points` / `starters` lag far behind -- one week it showed
// 39.74 for a roster whose best lineup was 223.26), so the live score is worked out here: the best possible lineup from every
// player's points so far, which is also what a best-ball week is finally scored on. Pure, tested in test/bestBall.test.mjs.

// Which positions can fill each lineup slot (Sleeper's roster_positions names). Slots we don't know (IDP and the like) are skipped.
const ELIGIBLE = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  WRRB_FLEX: ["WR", "RB"],
  REC_FLEX: ["WR", "TE"],
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};
// Fill the most restrictive slots first, each with the best player left who can play it (the usual lineups -- fixed positions, then
// FLEX, then SUPER_FLEX -- come out optimal this way).
const FILL_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "WRRB_FLEX", "REC_FLEX", "FLEX", "SUPER_FLEX"];

// points: { sleeperPlayerId: pointsSoFar } (a matchup entry's players_points); posOf(id) -> "QB" | "RB" | ... | undefined;
// slots: the league's non-bench roster_positions. Returns { total, picks: [{ id, slot, pts }] }.
export function bestLineup(points, posOf, slots) {
  const pool = Object.entries(points || {})
    .map(([id, pts]) => ({ id, pts: typeof pts === "number" ? pts : 0, pos: posOf(id) }))
    .filter((p) => p.pos);
  const used = new Set();
  const picks = [];
  for (const kind of FILL_ORDER) {
    const count = (slots || []).filter((s) => s === kind).length;
    for (let i = 0; i < count; i++) {
      const best = pool.filter((p) => !used.has(p.id) && ELIGIBLE[kind].includes(p.pos)).sort((a, b) => b.pts - a.pts)[0];
      if (!best) continue;
      used.add(best.id);
      picks.push({ id: best.id, slot: kind, pts: best.pts });
    }
  }
  return { total: Math.round(picks.reduce((t, p) => t + p.pts, 0) * 100) / 100, picks };
}
