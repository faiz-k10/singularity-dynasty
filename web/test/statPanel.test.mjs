import test from "node:test";
import assert from "node:assert/strict";
import { roleLeaders, meanRank } from "../lib/statPanel.js";

const R = (rank) => ({ rank, of: 30 });
test("meanRank needs the minimum number of ranks", () => {
  assert.equal(meanRank({ a: R(2), b: R(4) }, ["a", "b", "c"], 2), 3);
  assert.equal(meanRank({ a: R(2) }, ["a", "b", "c"], 2), null);
});

test("roleLeaders: the four lowest mean role ranks per position, thin profiles can't lead", () => {
  const roleKeys = ["avgXfp", "u_att_pg", "u_aypa", "u_rush_ypg", "scrambleRate", "playActionRate"];
  const ranks = (n) => Object.fromEntries(roleKeys.map((k) => [k, R(n)]));
  const rows = ["A", "B", "C", "D", "E", "F"].map((n, i) => ({ player_name: n, position: "QB", i }));
  const byName = { A: ranks(5), B: ranks(1), C: ranks(3), D: ranks(2), E: ranks(9), F: { avgXfp: R(1) } };
  const out = roleLeaders([...rows, { player_name: "Z", position: "RB" }], byName);
  assert.deepEqual(out.QB.map((x) => x.name), ["B", "D", "C", "A"]);
  assert.equal(out.QB[0].avg, 1);
  assert.deepEqual(out.RB, []);
});
