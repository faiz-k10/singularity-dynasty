// Rolls every player across every saved team up into one exposure table:
// how many of your teams roster them (raw + % of teams), how many start
// them, and -- when buy-ins are set -- the total dollars staked in teams
// that hold them and that as a share of your whole bankroll.
//
// Aggregated by Sleeper player_id (global across leagues). Pure function,
// unit-tested in test/portfolio.test.mjs.
//
// buyIns: { [savedTeamId]: number | null } overrides the row's own
// buy_in, so the UI can re-total live as the user edits.
export function buildPortfolio(savedTeams, buyIns = {}) {
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
    }
  }

  const n = savedTeams.length;
  const rows = [...byPlayer.values()].map((e) => ({
    ...e,
    exposurePct: n ? (e.teams / n) * 100 : 0,
    weightPct:
      totalBuyIn > 0 && e.hasInvested ? (e.invested / totalBuyIn) * 100 : null,
  }));

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
};
