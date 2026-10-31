// Match a Sleeper roster name to our published tables (redraft_rankings,
// player_simulations) the same way actions.js does server-side: Sleeper
// drops suffixes ("Luther Burden"), our data keeps them ("Brian Thomas
// Jr."), so normalize both to lowercase, no periods, no trailing suffix.
export function normalizePlayerName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .trim();
}

// A roster player's projection by name. The rankings can use a nickname Sleeper doesn't ("Chig Okonkwo" vs "Chigoziem Okonkwo"), so when
// the exact normalized name misses, take the ONE projected player with the same last name and the same first two letters; two candidates
// or none -> null (never a guess). The last-name index is built once per byName object.
const lastNameIndexes = new WeakMap();
export function findProjection(byName, name) {
  if (!byName) return null;
  const key = normalizePlayerName(name);
  if (byName[key]) return byName[key];
  let idx = lastNameIndexes.get(byName);
  if (!idx) {
    idx = new Map();
    for (const k of Object.keys(byName)) {
      const last = k.slice(k.lastIndexOf(" ") + 1);
      if (!idx.has(last)) idx.set(last, []);
      idx.get(last).push(k);
    }
    lastNameIndexes.set(byName, idx);
  }
  const sp = key.lastIndexOf(" ");
  if (sp < 0) return null;
  const pool = (idx.get(key.slice(sp + 1)) || []).filter((k) => k.slice(0, 2) === key.slice(0, 2));
  return pool.length === 1 ? byName[pool[0]] : null;
}

// Per-player fields carried straight from the saved snapshot (populated
// by actions.js at lookup time) -- first non-null value seen wins.
const SNAPSHOT_PLAYER_FIELDS = [
  "myProjPts",
];

// Rolls every player across every saved team up into one row per player:
// exposure (how many of your teams roster them + %), starts, buy-in
// dollars staked, plus the player's own projection / usage numbers from
// the snapshot.
//   sims     -> season floor/median/ceiling/wopr/epa (player_simulations),
//               keyed by normalizePlayerName
//   gameLogs -> array of that player's game rows (player_game_log), keyed
//               by normalizePlayerName -- attached raw as `_games` for the
//               My Analysis filter builder to aggregate however it likes.
//
// Aggregated by Sleeper player_id (global across leagues). Pure function,
// unit-tested in test/portfolio.test.mjs.
//
// buyIns: { [savedTeamId]: number | null } overrides the row's own
// buy_in, so the UI can re-total live as the user edits.
export function buildPortfolio(savedTeams, buyIns = {}, sims = {}, gameLogs = {}) {
  const byPlayer = new Map();
  let totalBuyIn = 0;
  let teamsWithBuyIn = 0;

  for (const t of savedTeams) {
    const raw = buyIns[t.id] ?? t.buy_in ?? null;
    const bi = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    if (bi != null) {
      totalBuyIn += bi;
      teamsWithBuyIn += 1;
    }
    for (const p of t.players || []) {
      if (!p.player_id) continue;
      let e = byPlayer.get(p.player_id);
      if (!e) {
        e = {
          player_id: p.player_id,
          name: p.name,
          position: p.position,
          team: p.team,
          teams: 0,
          starterCount: 0,
          invested: 0,
          hasInvested: false,
        };
        for (const f of SNAPSHOT_PLAYER_FIELDS) e[f] = null;
        byPlayer.set(p.player_id, e);
      }
      e.teams += 1;
      if (p.isStarter) e.starterCount += 1;
      if (bi != null) {
        e.invested += bi;
        e.hasInvested = true;
      }
      if (p.name) e.name = p.name;
      if (p.position) e.position = p.position;
      if (p.team) e.team = p.team;
      for (const f of SNAPSHOT_PLAYER_FIELDS) {
        if (e[f] == null && typeof p[f] === "number") e[f] = p[f];
      }
    }
  }

  const n = savedTeams.length;
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const rows = [...byPlayer.values()].map((e) => {
    const key = normalizePlayerName(e.name);
    const s = sims[key] || {};
    return {
      ...e,
      exposurePct: n ? (e.teams / n) * 100 : 0,
      weightPct:
        totalBuyIn > 0 && e.hasInvested ? (e.invested / totalBuyIn) * 100 : null,
      simFloor: num(s.floor),
      simMedian: num(s.median),
      simCeiling: num(s.ceiling),
      wopr: num(s.wopr),
      epa: num(s.epa),
      _games: Array.isArray(gameLogs[key]) ? gameLogs[key] : [],
    };
  });

  return { rows, totalBuyIn, teamsWithBuyIn, teamCount: n };
}

// Aggregate a player's game rows (row._games) over a filter window. Used
// by My Analysis for the "game-log" metrics. filters:
//   { season: "all"|number, weekFrom, weekTo, venue: "all"|"home"|"away",
//     result: "all"|"wins"|"losses" }
//
// Expected-points metrics (glExpPPG / glExpTotal / glPOE) are computed
// over only the games in the window that carry an xFP value
// (exp_points_ppr, from ffopportunity -- ~12% of games have none), and
// glPOE is actual-minus-expected measured over that same subset so the
// two sides line up.
export function aggregateGames(games, filters) {
  const f = filters || {};
  const wFrom = f.weekFrom ?? 1;
  const wTo = f.weekTo ?? 99;
  const r1 = (v) => Math.round(v * 10) / 10;
  const sel = (games || []).filter(
    (g) =>
      (f.season == null || f.season === "all" || Number(g.season) === Number(f.season)) &&
      g.week >= wFrom &&
      g.week <= wTo &&
      (!f.venue || f.venue === "all" || (f.venue === "home") === !!g.is_home) &&
      (!f.result || f.result === "all" || (f.result === "wins") === !!g.won)
  );
  if (sel.length === 0) {
    return {
      glGames: 0, glPPG: null, glTotal: null,
      glExpGames: 0, glExpPPG: null, glExpTotal: null, glPOE: null,
    };
  }
  const total = sel.reduce((s, g) => s + (Number(g.fantasy_points_ppr) || 0), 0);
  const withExp = sel.filter((g) => g.exp_points_ppr != null && g.exp_points_ppr !== "");
  let glExpPPG = null, glExpTotal = null, glPOE = null;
  if (withExp.length > 0) {
    const expTotal = withExp.reduce((s, g) => s + (Number(g.exp_points_ppr) || 0), 0);
    const actTotal = withExp.reduce((s, g) => s + (Number(g.fantasy_points_ppr) || 0), 0);
    glExpTotal = r1(expTotal);
    glExpPPG = r1(expTotal / withExp.length);
    glPOE = r1((actTotal - expTotal) / withExp.length);
  }
  return {
    glGames: sel.length,
    glTotal: r1(total),
    glPPG: r1(total / sel.length),
    glExpGames: withExp.length,
    glExpPPG,
    glExpTotal,
    glPOE,
  };
}

export const PORTFOLIO_COLUMN_TYPES = {
  name: "string",
  position: "string",
  team: "string",
  teams: "number",
  starterCount: "number",
  exposurePct: "number",
  invested: "number",
  weightPct: "number",
  myProjPts: "number",
  simFloor: "number",
  simMedian: "number",
  simCeiling: "number",
  wopr: "number",
  epa: "number",
  glPPG: "number",
  glTotal: "number",
  glGames: "number",
  glExpPPG: "number",
  glExpTotal: "number",
  glPOE: "number",
};
