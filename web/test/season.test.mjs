import test from "node:test";
import assert from "node:assert/strict";
import { seasonFromDate, nflSeason } from "../lib/season.js";

test("January and February belong to the season that started the September before", () => {
  assert.equal(seasonFromDate(new Date(2027, 0, 3)), 2026);
  assert.equal(seasonFromDate(new Date(2027, 1, 9)), 2026);
  assert.equal(seasonFromDate(new Date(2027, 2, 1)), 2027);
  assert.equal(seasonFromDate(new Date(2026, 10, 11)), 2026);
});

test("Sleeper's own calendar wins when we have it", () => {
  assert.equal(nflSeason({ season: "2026", league_season: "2027" }), 2026);
  assert.equal(nflSeason({ season: "2026", league_season: "2027" }, { leagues: true }), 2027);
  assert.equal(nflSeason({ season: "2026" }, { leagues: true }), 2026);
  assert.equal(nflSeason({}), seasonFromDate());
  assert.equal(nflSeason(null), seasonFromDate());
});
