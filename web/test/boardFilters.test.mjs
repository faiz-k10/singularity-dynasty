import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyFilters, filterCount, leagueFacts, matchesFilters, optionCounts, oddsBand } from "../lib/boardFilters.js";

const F = (o = {}) => ({ ...emptyFilters(), ...o });

test("leagueFacts: type tags combine (a dynasty best ball league is both), score and odds bands", () => {
  const f = leagueFacts({ settings: { leagueType: "dynasty", bestBall: true, qbFormat: "Superflex" }, standingLabel: "Favored", myScore: 50, oppScore: 40, odds: 0.7 });
  assert.deepEqual(f.types, ["dynasty", "bestball", "superflex"]);
  assert.equal(f.score, "lead");
  assert.equal(f.odds, "likely");
  assert.equal(leagueFacts({ myScore: 0, oppScore: 0 }).score, "even");
  assert.equal(leagueFacts({ myScore: 3, oppScore: 9 }).score, "trail");
  assert.equal(leagueFacts({}).score, null);
  assert.deepEqual(leagueFacts({ settings: { leagueType: null } }).types, []);
});

test("oddsBand: plain bands; a settled season is safe or out", () => {
  assert.equal(oddsBand(0.95), "safe");
  assert.equal(oddsBand(0.9), "safe");
  assert.equal(oddsBand(0.5), "bubble");
  assert.equal(oddsBand(0.2), "longshot");
  assert.equal(oddsBand(1, true), "safe");
  assert.equal(oddsBand(0, true), "longshot");
  assert.equal(oddsBand(null), null);
});

test("matchesFilters: OR within a row, AND across rows, unknown facts never match a picked row", () => {
  const dynastyFav = leagueFacts({ settings: { leagueType: "dynasty" }, standingLabel: "Favored", myScore: 5, oppScore: 1, odds: 0.95 });
  const redraftUnder = leagueFacts({ settings: { leagueType: "redraft" }, standingLabel: "Underdog", myScore: 1, oppScore: 5, odds: 0.2 });
  const unknown = leagueFacts({ settings: {} });
  assert.equal(matchesFilters(F(), unknown), true); // nothing picked: everything shows
  assert.equal(matchesFilters(F({ types: new Set(["dynasty", "redraft"]) }), dynastyFav), true);
  assert.equal(matchesFilters(F({ types: new Set(["dynasty", "redraft"]) }), unknown), false);
  assert.equal(matchesFilters(F({ types: new Set(["dynasty"]), standing: new Set(["Favored"]) }), dynastyFav), true);
  assert.equal(matchesFilters(F({ types: new Set(["dynasty"]), standing: new Set(["Underdog"]) }), dynastyFav), false);
  assert.equal(matchesFilters(F({ score: new Set(["trail"]) }), redraftUnder), true);
  assert.equal(matchesFilters(F({ odds: new Set(["longshot"]) }), dynastyFav), false);
});

test("optionCounts and filterCount", () => {
  const list = [
    leagueFacts({ settings: { leagueType: "dynasty", bestBall: true }, standingLabel: "Favored", myScore: 2, oppScore: 1, odds: 0.7 }),
    leagueFacts({ settings: { leagueType: "dynasty" }, standingLabel: "Underdog", myScore: 1, oppScore: 2, odds: 0.1 }),
  ];
  const c = optionCounts(list);
  assert.equal(c.types.dynasty, 2);
  assert.equal(c.types.bestball, 1);
  assert.equal(c.standing.Favored, 1);
  assert.equal(c.score.lead, 1);
  assert.equal(c.odds.longshot, 1);
  assert.equal(filterCount(F({ types: new Set(["a", "b"]), odds: new Set(["c"]) })), 3);
});
