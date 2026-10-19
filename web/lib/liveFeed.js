// The Sunday board's live panel and its game-day check (app/my-team/SundayBoard.js). Pure, no imports;
// tested in test/liveFeed.test.mjs.
//
// Only players ON THE FIELD RIGHT NOW (game in progress) -- yours and your opponents' -- across every saved league, or
// just one league when its matchup is open (onlyTeamId). Finished and not-started players are left out on purpose: the
// panel is for "who is playing for / against me at this moment", and finals made it noisy. From each league's
// head-to-head lineups (settings.h2h.mine / .opp, refreshed by the 30-second poll). A player who starts for you in 3
// leagues is one row with 3 starts; one who starts for you in one league and against you in another gets a row on
// each side. Each side's total adds every start's points in that league's own scoring.

// gameStates: lib/gameStatus.js parseScoreboard() output.
export function buildLiveFeed(savedTeams, gameStates, { onlyTeamId = null } = {}) {
  const empty = { mine: [], theirs: [], mineTotal: 0, theirsTotal: 0, nextStart: null };
  if (!gameStates) return empty;
  const sides = { mine: new Map(), theirs: new Map() };
  let nextStart = null;
  for (const t of savedTeams || []) {
    const s = t.settings || {};
    if (s.bestBall || s.isBye) continue;
    if (onlyTeamId != null && t.id !== onlyTeamId) continue;
    const league = t.league_name || t.team_name || "League";
    for (const [side, list] of [["mine", s.h2h?.mine], ["theirs", s.h2h?.opp]]) {
      for (const p of list || []) {
        if (!p.id || !p.team) continue;
        const g = gameStates[p.team];
        if (!g) continue;
        if (g.state === "pre" && g.start && (!nextStart || g.start < nextStart)) nextStart = g.start;
        if (g.state !== "in") continue;
        const pts = typeof p.pts === "number" ? p.pts : 0;
        let row = sides[side].get(p.id);
        if (!row) {
          row = { id: `${side}:${p.id}`, playerId: p.id, side, name: p.name, pos: p.pos, team: p.team, proj: p.proj, est: !!p.est, detail: g.detail || null, starts: [] };
          sides[side].set(p.id, row);
        }
        row.starts.push({ teamId: t.id, league, opponent: side === "theirs" ? s.opponent || null : null, pts });
      }
    }
  }
  const finish = (m) =>
    [...m.values()].map((r) => {
      const all = r.starts.map((x) => x.pts);
      return { ...r, pts: Math.max(...all), ptsMin: Math.min(...all), total: Math.round(all.reduce((a, b) => a + b, 0) * 100) / 100 };
    });
  const mine = finish(sides.mine);
  const theirs = finish(sides.theirs);
  const sum = (rows) => Math.round(rows.reduce((a, r) => a + r.total, 0) * 10) / 10;
  return { mine, theirs, mineTotal: sum(mine), theirsTotal: sum(theirs), nextStart };
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

// Newest scoring first, then most points.
export function sortFeed(rows, changedAt = {}) {
  return [...rows].sort((a, b) => (changedAt[b.id] || 0) - (changedAt[a.id] || 0) || b.pts - a.pts || a.name.localeCompare(b.name));
}

// A game day: a game is on, or one kicks off / finished today (local date). Without a scoreboard, fall back to the
// usual NFL days (Thursday, Sunday, Monday).
export function isGameDay(gameStates, now = new Date()) {
  const games = Object.values(gameStates || {});
  if (!games.length) return [0, 1, 4].includes(now.getDay());
  const today = now.toDateString();
  return games.some((g) => g.state === "in" || (g.start && new Date(g.start).toDateString() === today));
}
