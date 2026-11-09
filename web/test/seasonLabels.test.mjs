import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonLabels, seasonLabelsByName } from "../lib/seasonLabels.js";

const path = (...rows) => rows.map(([w, f, m, c]) => [w, f, m, c]);

test("floor above the week-1 ceiling is League Winner (not also Breakout)", () => {
  assert.deepEqual(seasonLabels(path([1, 24, 58, 98], [9, 182, 233, 274])), ["leagueWinners"]);
});
test("median above the week-1 ceiling, floor not, is Breakout", () => {
  assert.deepEqual(seasonLabels(path([1, 50, 100, 150], [9, 90, 160, 220])), ["breakout"]);
});
test("ceiling below the week-1 floor is Tank Commander; below only the median is Collapse", () => {
  assert.deepEqual(seasonLabels(path([1, 207, 250, 300], [9, 100, 146, 196])), ["tankCommander"]);
  assert.deepEqual(seasonLabels(path([1, 96, 154, 224], [9, 20, 50, 150])), ["collapse"]);
});
test("four straight weekly gains is Riser, four drops Faller, either can sit beside a tier label", () => {
  assert.deepEqual(seasonLabels(path([1, 10, 100, 190], [6, 10, 110, 190], [7, 10, 120, 190], [8, 10, 130, 190], [9, 10, 140, 190])), ["riser"]);
  assert.deepEqual(seasonLabels(path([1, 10, 100, 190], [6, 10, 90, 190], [7, 10, 80, 190], [8, 10, 70, 190], [9, 10, 60, 190])), ["faller"]);
  assert.deepEqual(seasonLabels(path([1, 24, 58, 98], [6, 160, 190, 250], [7, 170, 200, 260], [8, 175, 215, 265], [9, 182, 233, 274])), ["leagueWinners", "riser"]);
});
test("deep backups, a single snapshot and unordered rows", () => {
  assert.deepEqual(seasonLabels(path([1, 5, 30, 60], [9, 200, 300, 400])), []);
  assert.deepEqual(seasonLabels(path([1, 50, 100, 150])), []);
  assert.deepEqual(seasonLabels(path([9, 182, 233, 274], [1, 24, 58, 98])), ["leagueWinners"]);
});
test("seasonLabelsByName groups rows and leaves unlabelled players out", () => {
  const out = seasonLabelsByName([
    { player_name: "A", week: 1, floor: 24, median: 58, ceiling: 98 }, { player_name: "A", week: 9, floor: 182, median: 233, ceiling: 274 },
    { player_name: "B", week: 1, floor: 50, median: 100, ceiling: 150 }, { player_name: "B", week: 9, floor: 60, median: 110, ceiling: 160 },
  ]);
  assert.deepEqual(out, { A: ["leagueWinners"] });
});
