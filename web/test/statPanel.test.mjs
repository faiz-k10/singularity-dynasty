import test from "node:test";
import assert from "node:assert/strict";
import { groupRanks, meanRank, PANEL_KEYS } from "../lib/statPanel.js";

const R = (rank) => ({ rank, of: 30 });
const ROLE = PANEL_KEYS.QB.role;
const all = (n) => Object.fromEntries(ROLE.map((k) => [k, R(n)]));

test("meanRank needs the minimum number of ranks", () => {
  assert.equal(meanRank({ a: R(2), b: R(4) }, ["a", "b", "c"], 2), 3);
  assert.equal(meanRank({ a: R(2) }, ["a", "b", "c"], 2), null);
});

test("groupRanks: players are ranked by their average rank in the group, lowest average first; ties share the better rank", () => {
  const names = ["Caleb", "Willis", "Maye", "Allen", "Thin"];
  const rows = names.map((n) => ({ player_name: n, position: "QB" })).concat({ player_name: "Back", position: "RB" });
  const byName = { Caleb: all(9.7), Willis: all(11.2), Maye: all(11.7), Allen: all(11.7), Thin: { avgXfp: R(1) } };
  const out = groupRanks(rows, byName);
  assert.deepEqual(out.Caleb.role, { rank: 1, of: 4 });
  assert.deepEqual(out.Willis.role, { rank: 2, of: 4 });
  assert.deepEqual(out.Maye.role, { rank: 3, of: 4 });
  assert.deepEqual(out.Allen.role, { rank: 3, of: 4 }); // tied with Maye
  assert.equal(out.Thin, undefined, "one number is not enough to be placed");
  assert.equal(out.Back, undefined);
});
