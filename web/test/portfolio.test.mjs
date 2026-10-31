import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPortfolio, aggregateGames, normalizePlayerName } from "../lib/portfolio.js";

const P = (id, name, pos, team, st) => ({ player_id: id, name, position: pos, team, isStarter: st });
const team = (id, players, buy_in = null) => ({ id, players, buy_in });

const teams = [
  team("A", [P("1", "Josh Allen", "QB", "BUF", true), P("2", "Bijan", "RB", "ATL", true), P("3", "Puka", "WR", "LA", true)], 100),
  team("B", [P("1", "Josh Allen", "QB", "BUF", false), P("2", "Bijan", "RB", "ATL", true), P("4", "CeeDee", "WR", "DAL", true)], 50),
  team("C", [P("1", "Josh Allen", "QB", "BUF", true), P("3", "Puka", "WR", "LA", true), P("5", "Deep Guy", "RB", "NYJ", false)]),
];

test("buildPortfolio: exposure / starts / buy-in rollup", () => {
  const { rows, totalBuyIn, teamsWithBuyIn, teamCount } = buildPortfolio(teams);
  const byId = Object.fromEntries(rows.map((r) => [r.player_id, r]));

  assert.equal(teamCount, 3);
  assert.equal(totalBuyIn, 150, "only A + B set a buy-in");
  assert.equal(teamsWithBuyIn, 2);
  assert.equal(rows.length, 5, "unique players");

  assert.deepEqual([byId["1"].teams, byId["1"].exposurePct], [3, 100], "Allen on all 3");
  assert.equal(byId["1"].starterCount, 2);
  assert.equal(byId["1"].invested, 150);
  assert.equal(byId["1"].weightPct, 100);

  assert.deepEqual([byId["2"].teams, Math.round(byId["2"].exposurePct)], [2, 67]);
  assert.equal(byId["3"].teams, 2, "Puka on A + C");
  assert.equal(byId["3"].invested, 100, "only A has a buy-in");
  assert.equal(Math.round(byId["3"].weightPct * 10) / 10, 66.7);

  assert.deepEqual(
    [byId["5"].teams, byId["5"].starterCount, byId["5"].hasInvested],
    [1, 0, false],
    "Deep Guy: 1 team, 0 starts, no buy-in"
  );
  assert.equal(byId["5"].weightPct, null);
});

test("buildPortfolio: no buy-ins anywhere", () => {
  const noBuy = buildPortfolio(teams.map((t) => ({ ...t, buy_in: null })));
  assert.equal(noBuy.totalBuyIn, 0);
  assert.ok(noBuy.rows.every((r) => r.weightPct === null));
});

test("buildPortfolio: buyIns override", () => {
  const override = buildPortfolio(teams, { C: 25 });
  assert.equal(override.totalBuyIn, 175);
  assert.equal(override.rows.find((r) => r.player_id === "5").invested, 25);
});

test("normalizePlayerName", () => {
  assert.equal(normalizePlayerName("Brian Thomas Jr."), "brian thomas");
  assert.equal(normalizePlayerName("A.J. Brown"), "aj brown");
});

const projP = (id, name, pos, extra) => ({
  player_id: id, name, position: pos, team: "X", isStarter: true, ...extra,
});
const withProj = [
  team("A", [projP("1", "Josh Allen", "QB", { myProjPts: 22.5 })], 100),
  team("B", [projP("1", "Josh Allen", "QB", { myProjPts: 22.5 })], 100),
];
const sims = { "josh allen": { floor: 260, median: 340, ceiling: 420, wopr: 0, epa: 8.4 } };

test("buildPortfolio: snapshot projection fields + sim merge", () => {
  const enriched = buildPortfolio(withProj, {}, sims).rows[0];
  assert.equal(enriched.myProjPts, 22.5, "first non-null wins");
  assert.equal(enriched.simCeiling, 420);
  assert.equal(enriched.epa, 8.4);

  const noSim = buildPortfolio([team("A", [projP("9", "Nobody Special", "WR", {})])], {}, sims).rows[0];
  assert.equal(noSim.simCeiling, null);
  assert.equal(noSim.myProjPts, null);
  assert.equal(noSim._games.length, 0);
});

const g = (season, week, is_home, won, fp, xfp = null) => ({
  season, week, is_home, won, fantasy_points_ppr: fp, exp_points_ppr: xfp,
});
const logs = {
  "josh allen": [
    g(2024, 1, true, true, 30, 22), g(2024, 2, false, true, 20, 18), g(2024, 3, true, false, 10, 15),
    g(2025, 1, true, false, 40, 25), g(2025, 5, false, true, 12), g(2025, 9, true, true, 24, 20),
  ],
};

test("aggregateGames: window filters (season / venue / result / weeks)", () => {
  const withLog = buildPortfolio(withProj, {}, sims, logs).rows[0];
  assert.equal(withLog._games.length, 6, "game log attached");

  const all = aggregateGames(withLog._games, { season: "all", weekFrom: 1, weekTo: 18, venue: "all", result: "all" });
  assert.equal(all.glPPG, 22.7);
  assert.equal(aggregateGames(withLog._games, { venue: "home" }).glGames, 4);
  assert.equal(aggregateGames(withLog._games, { venue: "home", result: "wins" }).glGames, 2);
  assert.equal(aggregateGames(withLog._games, { venue: "home", result: "wins" }).glPPG, 27);
  assert.equal(aggregateGames(withLog._games, { season: "2025", weekFrom: 1, weekTo: 6 }).glGames, 2);
  assert.equal(aggregateGames(withLog._games, { season: "2025", weekFrom: 1, weekTo: 6 }).glTotal, 52);
  assert.equal(aggregateGames(withLog._games, { season: "2025", weekFrom: 14, weekTo: 18 }).glPPG, null, "empty window");
});

test("aggregateGames: expected-points metrics (only over games with an xFP value)", () => {
  const withLog = buildPortfolio(withProj, {}, sims, logs).rows[0];

  const all = aggregateGames(withLog._games, { season: "all", weekFrom: 1, weekTo: 18, venue: "all", result: "all" });
  assert.equal(all.glExpGames, 5, "5 of 6 games have xFP");
  assert.equal(all.glExpTotal, 100);
  assert.equal(all.glExpPPG, 20);
  assert.equal(all.glPOE, 4.8, "(124 actual - 100 expected) / 5");

  const home = aggregateGames(withLog._games, { venue: "home" });
  assert.equal(home.glExpPPG, 20.5);
  assert.equal(home.glPOE, 5.5);

  const partial = aggregateGames(withLog._games, { season: "2025", weekFrom: 1, weekTo: 6 });
  assert.deepEqual([partial.glGames, partial.glExpGames], [2, 1]);
  assert.equal(partial.glExpPPG, 25, "just wk1's xFP");

  assert.equal(
    aggregateGames(withLog._games, { season: "2025", weekFrom: 14, weekTo: 18 }).glExpPPG,
    null
  );
  assert.equal(
    aggregateGames([g(2024, 7, true, true, 15)], { season: "all" }).glPOE,
    null,
    "no xFP games in window -> glPOE null"
  );
});

test("findProjection falls back to one nickname match, never a guess", async () => {
  const { findProjection } = await import("../lib/portfolio.js");
  const byName = { "chig okonkwo": { proj: 7.4 }, "josh allen": { proj: 20 }, "jordan allen": { proj: 5 }, "mike williams": { proj: 9 }, "michael williams": { proj: 4 } };
  assert.equal(findProjection(byName, "Chigoziem Okonkwo").proj, 7.4);
  assert.equal(findProjection(byName, "Josh Allen").proj, 20);
  assert.equal(findProjection(byName, "Joshua Allen"), null); // Josh and Jordan both fit: ambiguous
  assert.equal(findProjection(byName, "Mike Williams").proj, 9);
  assert.equal(findProjection(byName, "Mitch Williams"), null);
  assert.equal(findProjection(byName, "Nobody Else"), null);
});
