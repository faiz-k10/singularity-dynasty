// Run: node test/portfolio.test.mjs
import { buildPortfolio, normalizePlayerName } from "../lib/portfolio.js";

let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

const P = (id, name, pos, team, st) => ({ player_id: id, name, position: pos, team, isStarter: st });
const team = (id, players, buy_in = null) => ({ id, players, buy_in });

const teams = [
  team("A", [P("1", "Josh Allen", "QB", "BUF", true), P("2", "Bijan", "RB", "ATL", true), P("3", "Puka", "WR", "LA", true)], 100),
  team("B", [P("1", "Josh Allen", "QB", "BUF", false), P("2", "Bijan", "RB", "ATL", true), P("4", "CeeDee", "WR", "DAL", true)], 50),
  team("C", [P("1", "Josh Allen", "QB", "BUF", true), P("3", "Puka", "WR", "LA", true), P("5", "Deep Guy", "RB", "NYJ", false)]),
];

const { rows, totalBuyIn, teamsWithBuyIn, teamCount } = buildPortfolio(teams);
const byId = Object.fromEntries(rows.map((r) => [r.player_id, r]));

eq("teamCount", teamCount, 3);
eq("totalBuyIn (only A+B set)", totalBuyIn, 150);
eq("teamsWithBuyIn", teamsWithBuyIn, 2);
eq("unique players", rows.length, 5);

eq("Allen exposure 3/3", [byId["1"].teams, byId["1"].exposurePct], [3, 100]);
eq("Allen starts 2", byId["1"].starterCount, 2);
eq("Allen invested (A100 + B50)", byId["1"].invested, 150);
eq("Allen bankroll % = 100", byId["1"].weightPct, 100);

eq("Bijan exposure 2/3", [byId["2"].teams, Math.round(byId["2"].exposurePct)], [2, 67]);
eq("Bijan invested (A100 + B50)", byId["2"].invested, 150);

eq("Puka exposure 2/3 (A + C)", byId["3"].teams, 2);
eq("Puka invested (only A has buy-in)", byId["3"].invested, 100);
eq("Puka bankroll % (100/150)", Math.round(byId["3"].weightPct * 10) / 10, 66.7);

eq("Deep Guy 1/3, 0 starts, no buy-in", [byId["5"].teams, byId["5"].starterCount, byId["5"].hasInvested], [1, 0, false]);
eq("Deep Guy weightPct null", byId["5"].weightPct, null);

// no buy-ins anywhere
const noBuy = buildPortfolio(teams.map((t) => ({ ...t, buy_in: null })));
eq("no buy-ins -> totalBuyIn 0", noBuy.totalBuyIn, 0);
eq("no buy-ins -> all weightPct null", noBuy.rows.every((r) => r.weightPct === null), true);

// buyIns override
const override = buildPortfolio(teams, { C: 25 });
eq("override adds C's 25", override.totalBuyIn, 175);
eq("override: Deep Guy now invested 25", override.rows.find((r) => r.player_id === "5").invested, 25);

// name normalization
eq("normalize strips suffix + case + period", normalizePlayerName("Brian Thomas Jr."), "brian thomas");
eq("normalize A.J. Brown", normalizePlayerName("A.J. Brown"), "aj brown");

// snapshot projection fields + sim merge
const projP = (id, name, pos, extra) => ({
  player_id: id, name, position: pos, team: "X", isStarter: true, ...extra,
});
const withProj = [
  team("A", [projP("1", "Josh Allen", "QB", { myProjPts: 22.5, sleeperProjPts: 21, diffProj: 1.5, startPct: 99, rosterPct: 100 })], 100),
  team("B", [projP("1", "Josh Allen", "QB", { myProjPts: 22.5 })], 100),
];
const sims = { "josh allen": { floor: 260, median: 340, ceiling: 420, wopr: 0, epa: 8.4 } };
const enriched = buildPortfolio(withProj, {}, sims).rows[0];
eq("snapshot: first non-null myProjPts wins", enriched.myProjPts, 22.5);
eq("snapshot: startPct carried from team A", enriched.startPct, 99);
eq("sim merge: ceiling", enriched.simCeiling, 420);
eq("sim merge: epa", enriched.epa, 8.4);

// player with no sim entry -> sim fields null
const noSim = buildPortfolio([team("A", [projP("9", "Nobody Special", "WR", {})])], {}, sims).rows[0];
eq("no sim entry -> simCeiling null", noSim.simCeiling, null);
eq("no snapshot proj -> myProjPts null", noSim.myProjPts, null);

// splits merge (4th arg)
const splits = {
  "josh allen": { games: 32, ppg_home: 26.9, ppg_away: 19.6, ppg_wins: 24.3, ppg_losses: 19.9, ppg_last4: 23.1 },
};
const withSplits = buildPortfolio(withProj, {}, sims, splits).rows[0];
eq("split merge: ppgHome", withSplits.ppgHome, 26.9);
eq("split merge: ppgWins", withSplits.ppgWins, 24.3);
eq("split merge: splitGames", withSplits.splitGames, 32);
eq("no split entry -> ppgHome null", noSim.ppgHome ?? null, null);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
