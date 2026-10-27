import test from "node:test";
import assert from "node:assert/strict";
import { ownedFor, myPlayerCount, mineFromTeams } from "../lib/myPlayers.js";

const mine = {
  signedIn: true,
  teams: ["Dynasty", "Redraft"],
  byName: {
    "josh allen": [[0, 1]],
    "bijan robinson": [[0, 1, "D"], [1, 0, "T"]],
    "amon-ra st brown": [[1, 0, "P"]],
  },
};

test("ownedFor matches names the way the rest of the site does (case, dots, suffixes)", () => {
  assert.equal(ownedFor(mine, "Josh Allen").starter, true);
  assert.equal(ownedFor(mine, "Amon-Ra St. Brown").leagues[0].label, "Redraft");
  assert.equal(ownedFor(mine, "Nobody Here"), null);
});

test("ownedFor lists every team he is on and whether he starts anywhere", () => {
  const o = ownedFor(mine, "Bijan Robinson");
  assert.equal(o.leagues.length, 2);
  assert.equal(o.starter, true);
});

test("ownedFor narrows to one team and reports bench-only", () => {
  const o = ownedFor(mine, "Bijan Robinson", "1");
  assert.deepEqual(o.leagues, [{ label: "Redraft", starter: false, how: "traded" }]);
  assert.equal(o.starter, false);
  assert.equal(ownedFor(mine, "Josh Allen", "1"), null);
});

test("how he was acquired travels with each league (null when unknown), from the saved roster's `acquired`", () => {
  assert.deepEqual(ownedFor(mine, "Bijan Robinson").leagues.map((l) => l.how), ["drafted", "traded"]);
  assert.equal(ownedFor(mine, "Amon-Ra St. Brown").leagues[0].how, "pickup");
  assert.equal(ownedFor(mine, "Josh Allen").leagues[0].how, null);
  const built = mineFromTeams([{ league_name: "L", players: [{ name: "Josh Allen", isStarter: true, acquired: "drafted" }, { name: "Bijan Robinson" }] }]);
  assert.deepEqual(built.byName, { "josh allen": [[0, 1, "D"]], "bijan robinson": [[0, 0, ""]] });
});

test("myPlayerCount counts distinct players, per team or overall", () => {
  assert.equal(myPlayerCount(mine), 3);
  assert.equal(myPlayerCount(mine, "0"), 2);
  assert.equal(myPlayerCount(mine, "1"), 2);
  assert.equal(myPlayerCount(null), 0);
});
