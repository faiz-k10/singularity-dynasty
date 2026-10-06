import { test } from "node:test";
import assert from "node:assert/strict";
import { positionRanks } from "../lib/positionRank.js";

test("ranks within each position by median, highest first", () => {
  const r = positionRanks([
    { player_name: "A", position: "WR", median: 300 },
    { player_name: "B", position: "QB", median: 350 },
    { player_name: "C", position: "WR", median: 320 },
    { player_name: "D", position: "TE", median: 150 },
    { player_name: "E", position: "QB", median: 340 },
  ]);
  assert.deepEqual(r, { C: 1, A: 2, B: 1, E: 2, D: 1 });
});

test("ties break by name, and the input is not reordered", () => {
  const rows = [
    { player_name: "Zed", position: "RB", median: 200 },
    { player_name: "Amy", position: "RB", median: 200 },
  ];
  assert.deepEqual(positionRanks(rows), { Amy: 1, Zed: 2 });
  assert.equal(rows[0].player_name, "Zed");
});
