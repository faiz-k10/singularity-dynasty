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
// the snapshot. Both keyed by normalizePlayerName:
//   sims   -> season floor/median/ceiling/wopr/epa (player_simulations)
//   splits -> home/away, win/loss, last-4 PPG (player_splits)
//
// Aggregated by Sleeper player_id (global across leagues). Pure function,
// unit-tested in test/portfolio.test.mjs.
//
// buyIns: { [savedTeamId]: number | null } overrides the row's own
// buy_in, so the UI can re-total live as the user edits.
export function buildPortfolio(savedTeams, buyIns = {}, sims = {}, splits = {}) {
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
    const sp = splits[key] || {};
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
      splitGames: num(sp.games),
      ppgHome: num(sp.ppg_home),
      ppgAway: num(sp.ppg_away),
      ppgWins: num(sp.ppg_wins),
      ppgLosses: num(sp.ppg_losses),
      ppgLast4: num(sp.ppg_last4),
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
  splitGames: "number",
  ppgHome: "number",
  ppgAway: "number",
  ppgWins: "number",
  ppgLosses: "number",
  ppgLast4: "number",
};
