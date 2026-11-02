// Which paywall earns money: wall_hits rows (migration 0040) summed per wall. Shared by scripts/wall-report.mjs and /admin;
// pure, tested in test/wallReport.test.mjs.
//   views    times a wall was seen (once per visitor session)    clicks   clicks toward pricing from it
//   clickPct clicks / views (null with no views)                 clickers signed-in people who clicked; upgraded = how many are on a paid tier NOW
// "Upgraded" is a rough read: a person who clicked three walls counts for all three, and anonymous visitors can't be matched.
export function summarizeWalls(rows, paidIds = new Set()) {
  const by = {};
  for (const r of rows || []) {
    const w = (by[r.wall] ??= { views: 0, clicks: 0, clickers: new Set() });
    if (r.type === "view") w.views++;
    else {
      w.clicks++;
      if (r.user_id) w.clickers.add(r.user_id);
    }
  }
  return Object.entries(by)
    .map(([wall, w]) => ({
      wall,
      views: w.views,
      clicks: w.clicks,
      clickPct: w.views ? (100 * w.clicks) / w.views : null,
      clickers: w.clickers.size,
      upgraded: [...w.clickers].filter((id) => paidIds.has(id)).length,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.views - a.views);
}
