import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeLeagues } from "../lib/heroLookup.js";

const P = (name, position, extra = {}) => ({ name, position, team: "BUF", myProjPts: null, isStarter: false, ...extra });
const teams = [
  { league_name: "A", settings: { qbFormat: "Superflex", scoring: "Full PPR", matchupProj: { mine: 120, opp: 110 } }, players: [P("Josh Allen", "QB", { myProjPts: 25.3, isStarter: true }), P("Puka Nacua", "WR", { myProjPts: 17 })] },
  { league_name: "B", settings: { qbFormat: "Superflex", scoring: "Full PPR", matchupProj: { mine: 100, opp: 105 } }, players: [P("Josh Allen", "QB", { myProjPts: 25.3 }), P("Bijan Robinson", "RB", { myProjPts: 21 })] },
  { league_name: "C", settings: { qbFormat: "1QB", scoring: "Half PPR", matchupProj: null }, players: [P("Josh Allen", "QB", { myProjPts: 25.3 }), P("Puka Nacua", "WR", { myProjPts: 17 })] },
];

test("counts leagues and the format mix, biggest group first", () => {
  const s = summarizeLeagues(teams);
  assert.equal(s.leagues, 3);
  assert.deepEqual(s.formats[0], { label: "Superflex Full PPR", count: 2 });
});

test("exposure: players owned in 2+ leagues, most leagues first, with this week's projection", () => {
  const s = summarizeLeagues(teams);
  assert.deepEqual(s.exposure.map((e) => [e.name, e.leagues]), [["Josh Allen", 3], ["Puka Nacua", 2]]);
  assert.equal(s.exposure[0].proj, 25.3);
  assert.equal(s.exposure[0].starts, 1);
});

test("matchups: counts only leagues with a projection on both sides", () => {
  const s = summarizeLeagues(teams);
  assert.deepEqual(s.matchups, { projected: 2, wins: 1 });
});

test("name matching ignores case and punctuation; empty input is safe", () => {
  const t = [
    { settings: {}, players: [P("Marvin Harrison Jr.", "WR")] },
    { settings: {}, players: [P("marvin harrison jr", "WR")] },
  ];
  assert.equal(summarizeLeagues(t).exposure[0].leagues, 2);
  assert.deepEqual(summarizeLeagues(null), { leagues: 0, formats: [], exposure: [], matchups: { projected: 0, wins: 0 } });
});
