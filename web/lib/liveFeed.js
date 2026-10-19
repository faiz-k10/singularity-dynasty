// The Sunday board's "My players live" list and its game-day check (app/my-team/SundayBoard.js). Pure, no imports;
// tested in test/liveFeed.test.mjs.
//
// One row per player who STARTS for you somewhere and whose game is in progress or final, across every saved league
// (from each league's head-to-head lineup, settings.h2h.mine, refreshed by the 30-second poll). A player started in 3
// leagues is one row with 3 starts; the header total adds each start's points in that league's own scoring, so he
// counts 3x there, which is what those games actually feel.

// gameStates: lib/gameStatus.js parseScoreboard() output.
export function buildLiveFeed(savedTeams, gameStates) {
  const byId = new Map();
  if (!gameStates) return { rows: [], starts: 0, points: 0 };
  for (const t of savedTeams || []) {
    const s = t.settings || {};
    if (s.bestBall || s.isBye) continue;
    for (const p of s.h2h?.mine || []) {
      if (!p.id || !p.team) continue;
      const g = gameStates[p.team];
      if (!g || (g.state !== "in" && g.state !== "post")) continue;
      const pts = typeof p.pts === "number" ? p.pts : 0;
      let row = byId.get(p.id);
      if (!row) {
        row = { id: p.id, name: p.name, pos: p.pos, team: p.team, proj: p.proj, est: !!p.est, state: g.state, detail: g.detail || null, starts: [] };
        byId.set(p.id, row);
      }
      row.starts.push({ teamId: t.id, league: t.league_name || t.team_name || "League", pts });
    }
  }
  let starts = 0;
  let points = 0;
  const rows = [...byId.values()].map((r) => {
    const all = r.starts.map((x) => x.pts);
    const total = all.reduce((a, b) => a + b, 0);
    starts += r.starts.length;
    points += total;
    return { ...r, pts: Math.max(...all), ptsMin: Math.min(...all), total: Math.round(total * 100) / 100 };
  });
  return { rows, starts, points: Math.round(points * 10) / 10 };
}

// Remembers when each player's points last went up, so the list can put the newest scoring first.
// prev: { last: {id: pts}, changedAt: {id: ms}, delta: {id: +pts} } (or null on first load). On the first load nothing
// counts as "new" -- we don't know the order things happened in, only what's on the board now.
export function trackScoring(prev, rows, now) {
  const last = {};
  const changedAt = { ...(prev?.changedAt || {}) };
  const delta = { ...(prev?.delta || {}) };
  for (const r of rows) {
    last[r.id] = r.pts;
    const before = prev?.last?.[r.id];
    if (prev && r.pts !== before) {
      changedAt[r.id] = now;
      delta[r.id] = Math.round((r.pts - (before ?? 0)) * 100) / 100;
    }
  }
  return { last, changedAt, delta };
}

// Newest scoring first; then games still on before finals; then most points.
export function sortFeed(rows, changedAt = {}) {
  const live = (r) => (r.state === "in" ? 1 : 0);
  return [...rows].sort(
    (a, b) => (changedAt[b.id] || 0) - (changedAt[a.id] || 0) || live(b) - live(a) || b.pts - a.pts || a.name.localeCompare(b.name)
  );
}

// A game day: a game is on, or one kicks off / finished today (local date). Without a scoreboard, fall back to the
// usual NFL days (Thursday, Sunday, Monday).
export function isGameDay(gameStates, now = new Date()) {
  const games = Object.values(gameStates || {});
  if (!games.length) return [0, 1, 4].includes(now.getDay());
  const today = now.toDateString();
  return games.some((g) => g.state === "in" || (g.start && new Date(g.start).toDateString() === today));
}
