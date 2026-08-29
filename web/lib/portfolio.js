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

// Per-player fields carried straight from the saved snapshot (populated
// by actions.js at lookup time) -- first non-null value seen wins.
const SNAPSHOT_PLAYER_FIELDS = [
  "myProjPts",
  "sleeperProjPts",
  "diffProj",
  "startPct",
  "rosterPct",
];

// Rolls every player across every saved team up into one row per player:
// exposure (how many of your teams roster them + %), starts, buy-in
// dollars staked, plus the player's own projection / usage numbers from
// the snapshot. `sims` (optional, keyed by normalizePlayerName) merges in
// season floor/median/ceiling/wopr/epa from player_simulations.
//
// Aggregated by Sleeper player_id (global across leagues). Pure function,
// unit-tested in test/portfolio.test.mjs.
//
// buyIns: { [savedTeamId]: number | null } overrides the row's own
// buy_in, so the UI can re-total live as the user edits.
export function buildPortfolio(savedTeams, buyIns = {}, sims = {}) {
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
  const rows = [...byPlayer.values()].map((e) => {
    const s = sims[normalizePlayerName(e.name)] || {};
    return {
      ...e,
      exposurePct: n ? (e.teams / n) * 100 : 0,
      weightPct:
        totalBuyIn > 0 && e.hasInvested ? (e.invested / totalBuyIn) * 100 : null,
      simFloor: typeof s.floor === "number" ? s.floor : null,
      simMedian: typeof s.median === "number" ? s.median : null,
      simCeiling: typeof s.ceiling === "number" ? s.ceiling : null,
      wopr: typeof s.wopr === "number" ? s.wopr : null,
      epa: typeof s.epa === "number" ? s.epa : null,
    };
  });

  return { rows, totalBuyIn, teamsWithBuyIn, teamCount: n };
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
  sleeperProjPts: "number",
  diffProj: "number",
  startPct: "number",
  rosterPct: "number",
  simFloor: "number",
  simMedian: "number",
  simCeiling: "number",
  wopr: "number",
  epa: "number",
};
