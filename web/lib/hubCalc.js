// Pure calculations behind the landing page's data hub (app/hub/HubClient.js). No React, no database -- unit-tested.

export const POSITIONS = ["QB", "RB", "WR", "TE"];
export const STAGES = {
  QB: ["Ascending", "Prime", "Veteran"],
  RB: ["Ascending", "Prime", "Decline Watch", "Late Career"],
  WR: ["Ascending", "Prime", "Decline Watch", "Late Career"],
  TE: ["Ascending", "Prime", "Decline Watch", "Late Career"],
};

// Is it the NFL season? September through January, and the newest published season is the one in progress.
export function isInSeason(now, latestSeason) {
  if (latestSeason == null) return false;
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  if (m >= 9) return latestSeason === y;
  if (m === 1) return latestSeason === y - 1;
  return false;
}

export function pickDefaultTab(config, now, latestSeason) {
  if (config.defaultTab && config.defaultTab !== "auto") return config.defaultTab;
  return isInSeason(now, latestSeason) ? "inseason" : "offseason";
}

export const byPos = (rows, pos) => (pos && pos !== "ALL" ? rows.filter((r) => r.pos === pos) : rows);

// Week-over-week change in the median projection. A player needs a real previous number (3+ points) so a player coming
// off a bye / injury at ~0 can't top the list with a meaningless jump.
export function buildMovers(players, { pos = "ALL", limit = 5 } = {}) {
  const rows = byPos(players, pos)
    .filter((p) => p.proj != null && p.prev != null && p.prev >= 3)
    .map((p) => ({ ...p, delta: p.proj - p.prev }));
  const risers = rows.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, limit);
  const fallers = rows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, limit);
  const maxAbs = Math.max(0.1, ...risers.map((r) => r.delta), ...fallers.map((r) => -r.delta));
  return { risers, fallers, maxAbs };
}

// The top of a list by `sortKey` (the ceiling by default), each with its floor / median / ceiling for the range bar.
export function buildRangeLeaders(rows, { pos = "ALL", limit = 6, floorKey = "floor", medianKey = "proj", ceilKey = "ceil", sortKey = ceilKey } = {}) {
  const list = byPos(rows, pos)
    .filter((r) => r[floorKey] != null && r[medianKey] != null && r[ceilKey] != null)
    .sort((a, b) => b[sortKey] - a[sortKey])
    .slice(0, limit)
    .map((r) => ({ ...r, lo: r[floorKey], mid: r[medianKey], hi: r[ceilKey] }));
  const max = Math.max(1, ...list.map((r) => r.hi));
  return { list, max };
}

// Running Hot / Running Cold: actual fantasy points per game vs what his opportunity suggests.
export function buildHotCold(players, { pos = "ALL", limit = 4 } = {}) {
  const rows = byPos(players, pos)
    .filter((p) => (p.sus === "Running Hot" || p.sus === "Running Cold") && p.susFp != null && p.susXfp != null)
    .map((p) => ({ ...p, gap: p.susFp - p.susXfp }));
  return {
    hot: rows.filter((r) => r.sus === "Running Hot").sort((a, b) => b.gap - a.gap).slice(0, limit),
    cold: rows.filter((r) => r.sus === "Running Cold").sort((a, b) => a.gap - b.gap).slice(0, limit),
  };
}

// Strongest defense-vs-position leans, grouped by defense.
export function buildLeanGroups(leans, { pos = "ALL", limit = 6 } = {}) {
  const by = new Map();
  for (const l of leans) {
    if (pos !== "ALL" && l.pos !== pos) continue;
    const g = by.get(l.def) || { def: l.def, items: [], best: 0 };
    g.items.push(l);
    g.best = Math.max(g.best, l.score || 0);
    by.set(l.def, g);
  }
  return [...by.values()].sort((a, b) => b.best - a.best).slice(0, limit);
}

// Share of each position's players in each career stage -- rows for the stacked bars.
export function buildStageBars(stageCounts, { pos = "ALL" } = {}) {
  const positions = pos === "ALL" ? POSITIONS : [pos];
  return positions
    .map((p) => {
      const counts = stageCounts?.[p] || {};
      const total = (STAGES[p] || []).reduce((s, st) => s + (counts[st] || 0), 0);
      if (!total) return null;
      return {
        pos: p,
        total,
        segments: STAGES[p].map((stage) => ({ stage, count: counts[stage] || 0, pct: ((counts[stage] || 0) / total) * 100 })),
      };
    })
    .filter(Boolean);
}

// Age vs projection scatter plus a simple trend (average projection by two-year age bucket).
export function buildAgeCurve(players, { pos = "ALL" } = {}) {
  const pts = byPos(players, pos).filter((p) => p.age != null && p.proj != null && p.proj > 0);
  if (pts.length < 3) return null;
  const minAge = Math.min(...pts.map((p) => p.age));
  const maxAge = Math.max(...pts.map((p) => p.age));
  const buckets = new Map();
  for (const p of pts) {
    const b = Math.floor(p.age / 2) * 2;
    const e = buckets.get(b) || { sum: 0, n: 0 };
    e.sum += p.proj;
    e.n += 1;
    buckets.set(b, e);
  }
  const trend = [...buckets.entries()]
    .filter(([, e]) => e.n >= 2)
    .map(([b, e]) => ({ age: b + 1, avg: e.sum / e.n, n: e.n }))
    .sort((a, b) => a.age - b.age);
  return { pts, trend, minAge, maxAge, maxProj: Math.max(...pts.map((p) => p.proj)) };
}

// Players in the given career stages (e.g. the dynasty "assets on the move": Ascending vs Decline Watch / Late Career),
// best-ranked first.
export function buildStageList(players, stages, { pos = "ALL", limit = 5 } = {}) {
  return byPos(players, pos)
    .filter((p) => p.stage && stages.includes(p.stage))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}
