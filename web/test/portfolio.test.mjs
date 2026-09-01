// Run: node test/portfolio.test.mjs
import { buildPortfolio, aggregateGames, normalizePlayerName } from "../lib/portfolio.js";

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

// game-log attach (4th arg) + aggregateGames
const g = (season, week, is_home, won, fp, xfp = null) => ({
  season, week, is_home, won, fantasy_points_ppr: fp, exp_points_ppr: xfp,
});
const logs = {
  "josh allen": [
    g(2024, 1, true, true, 30, 22), g(2024, 2, false, true, 20, 18), g(2024, 3, true, false, 10, 15),
    g(2025, 1, true, false, 40, 25), g(2025, 5, false, true, 12), g(2025, 9, true, true, 24, 20),
  ],
};
const withLog = buildPortfolio(withProj, {}, sims, logs).rows[0];
eq("game log attached as _games", withLog._games.length, 6);
eq("no log -> empty _games", noSim._games.length, 0);

eq("agg: all games PPG", aggregateGames(withLog._games, { season: "all", weekFrom: 1, weekTo: 18, venue: "all", result: "all" }).glPPG, 22.7);
eq("agg: home only", aggregateGames(withLog._games, { venue: "home" }).glGames, 4);
eq("agg: home wins", aggregateGames(withLog._games, { venue: "home", result: "wins" }).glGames, 2);
eq("agg: home wins PPG (30 + 24)/2", aggregateGames(withLog._games, { venue: "home", result: "wins" }).glPPG, 27);
eq("agg: 2025 weeks 1-6", aggregateGames(withLog._games, { season: "2025", weekFrom: 1, weekTo: 6 }).glGames, 2);
eq("agg: 2025 wk1-6 total (40 + 12)", aggregateGames(withLog._games, { season: "2025", weekFrom: 1, weekTo: 6 }).glTotal, 52);
eq("agg: empty window -> nulls", aggregateGames(withLog._games, { season: "2025", weekFrom: 14, weekTo: 18 }).glPPG, null);

// expected-points metrics -- only over games that carry an xFP value
const allAgg = aggregateGames(withLog._games, { season: "all", weekFrom: 1, weekTo: 18, venue: "all", result: "all" });
eq("agg: xFP games (5 of 6 have xfp)", allAgg.glExpGames, 5);
eq("agg: xFP total (22+18+15+25+20)", allAgg.glExpTotal, 100);
eq("agg: xFP PPG (100/5)", allAgg.glExpPPG, 20);
eq("agg: FP over xFP /g ((124-100)/5)", allAgg.glPOE, 4.8);
const homeAgg = aggregateGames(withLog._games, { venue: "home" });
eq("agg: home xFP PPG ((22+15+25+20)/4)", homeAgg.glExpPPG, 20.5);
eq("agg: home FPOE /g ((104-82)/4)", homeAgg.glPOE, 5.5);
const partialXfp = aggregateGames(withLog._games, { season: "2025", weekFrom: 1, weekTo: 6 });
eq("agg: partial xFP -- 1 of 2 games", [partialXfp.glGames, partialXfp.glExpGames], [2, 1]);
eq("agg: partial xFP PPG (just wk1's 25)", partialXfp.glExpPPG, 25);
eq("agg: empty window -> xFP nulls", aggregateGames(withLog._games, { season: "2025", weekFrom: 14, weekTo: 18 }).glExpPPG, null);
eq("agg: window with zero xFP games -> glPOE null", aggregateGames([g(2024, 7, true, true, 15)], { season: "all" }).glPOE, null);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
