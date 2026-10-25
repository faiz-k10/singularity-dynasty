import test from "node:test";
import assert from "node:assert/strict";
import { buildBench, benchFromRoster } from "../lib/h2hBench.js";

const INFO = {
  "1": { name: "Starter", pos: "RB", team: "SF", active: true },
  "2": { name: "Bench Rb", pos: "RB", team: "DAL", active: true },
  "3": { name: "Bench Wr", pos: "WR", team: "KC", active: true },
  "4": { name: "Deep Reserve", pos: "WR", team: "NYG", active: true },
  "5": { name: "Hurt Guy", pos: "TE", team: "BUF", active: false },
  "6": { name: "Linebacker", pos: "LB", team: "DAL", active: true },
  "7": { name: "Scored Anyway", pos: "WR", team: "MIA", active: true },
};
const PROJ = { "bench rb": { proj: 9, floor: 3, ceiling: 18 }, "bench wr": { proj: 12, floor: 5, ceiling: 24 } };
const infoFor = (id) => INFO[id] || null;
const projFor = (name) => PROJ[name.toLowerCase()] || null;

test("buildBench keeps the non-starters we project (or who scored), best projection first, and leaves out IDP, inactive and unprojected reserves", () => {
  const entry = { starters: ["1"], players: ["1", "2", "3", "4", "5", "6", "7", "0"], players_points: { "7": 3.4 } };
  const bench = buildBench(entry, infoFor, projFor);
  assert.deepEqual(bench.map((p) => p.name), ["Bench Wr", "Bench Rb", "Scored Anyway"]);
  assert.ok(bench.every((p) => p.slot === "BN"));
  assert.equal(bench[0].floor, 5);
  assert.equal(bench[2].pts, 3.4);
});

test("buildBench: nothing without an entry; a player our directory doesn't know is not shown", () => {
  assert.deepEqual(buildBench(null, infoFor, projFor), []);
  assert.deepEqual(buildBench({ starters: [], players: ["999"] }, infoFor, projFor), []);
});

test("benchFromRoster: my bench from a snapshot that predates saved benches", () => {
  const players = [
    { player_id: "1", name: "Starter", position: "RB", team: "SF", isStarter: true, myProjPts: 15 },
    { player_id: "2", name: "Backup RB", position: "RB", team: "DAL", isStarter: false, myProjPts: 7, myFloor: 2, myCeiling: 14 },
    { player_id: "3", name: "No Projection", position: "WR", team: "KC", isStarter: false },
    { player_id: "4", name: "Better WR", position: "WR", team: "KC", isStarter: false, myProjPts: 11 },
    { player_id: "5", name: "A Lineman", position: "OL", team: "KC", isStarter: false, myProjPts: 3 },
  ];
  const bench = benchFromRoster(players, { "3": 0.8 });
  assert.deepEqual(bench.map((p) => p.name), ["Better WR", "Backup RB", "No Projection"]); // scored 0.8, so shown despite no projection
  assert.equal(bench[1].floor, 2);
  assert.equal(bench[2].pts, 0.8);
  assert.equal(bench[0].slot, "BN");
});
