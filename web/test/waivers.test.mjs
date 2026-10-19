import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWaiverList, sleeperIndex } from "../lib/waivers.js";

const dict = {
  1: { first_name: "Rico", last_name: "Dowdle", position: "RB", team: "PIT" },
  2: { first_name: "Tanner", last_name: "McKee", position: "QB", team: "PHI" },
  3: { first_name: "Jaylen", last_name: "Waddle", position: "WR", team: "MIA" },
  4: { first_name: "Mike", last_name: "Williams", position: "WR", team: "NYJ" },
  5: { first_name: "Mike", last_name: "Williams", position: "WR", team: "PIT" },
  6: { first_name: "Old", last_name: "Timer", position: "WR", team: null }, // retired: not indexed
  7: { first_name: "Marvin", last_name: "Harrison", position: "WR", team: "ARI" },
};
const row = (rank, player_name, position, team, projection, extra = {}) => ({ rank, player_name, position, team, opponent: "DAL", is_home: true, projection, floor: projection / 2, ceiling: projection * 1.6, ...extra });
const rows = [
  row(10, "Jaylen Waddle", "WR", "MIA", 14),
  row(40, "Rico Dowdle", "RB", "PIT", 11),
  row(60, "Mike Williams", "WR", "PIT", 9),
  row(70, "Tanner McKee", "QB", "PHI", 15),
  row(80, "Marvin Harrison Jr.", "WR", "ARI", 8),
  row(90, "Bye Guy", "WR", "MIA", 12, { opponent: "NA" }),
  row(95, "Old Timer", "WR", "MIA", 6),
];

test("buildWaiverList: only players on no roster, ranked by projection, with position rank and trending adds", () => {
  const { players, hidden } = buildWaiverList({ rows, rostered: new Set(["3"]), idx: sleeperIndex(dict), trending: [{ player_id: "2", count: 41000 }] });
  // Waddle is rostered; the bye-week and unmatched players are left out; the suffix ("Jr.") still matches.
  assert.deepEqual(players.map((p) => p.name), ["Tanner McKee", "Rico Dowdle", "Mike Williams", "Marvin Harrison Jr."]);
  assert.equal(players[0].adds, 41000);
  assert.equal(players[2].id, "5"); // two Mike Williams at WR: the team decides
  assert.equal(players[2].posRank, 2); // WR rank among everyone projected (Waddle is WR 1)
  assert.equal(hidden, 0);
});

test("buildWaiverList: free depth stops at the free top 50 and counts the rest", () => {
  const { players, hidden } = buildWaiverList({ rows, rostered: new Set(), idx: sleeperIndex(dict), maxRank: 50 });
  assert.deepEqual(players.map((p) => p.name), ["Jaylen Waddle", "Rico Dowdle"]);
  assert.equal(hidden, 3);
});

test("buildWaiverList: capped per position", () => {
  const many = Array.from({ length: 20 }, (_, i) => row(i + 1, `Mike Williams`, "WR", "PIT", 20 - i));
  const { players } = buildWaiverList({ rows: many, rostered: new Set(), idx: sleeperIndex(dict), perPosition: 5 });
  assert.equal(players.length, 5);
});
