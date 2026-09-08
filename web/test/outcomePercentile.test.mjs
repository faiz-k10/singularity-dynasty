import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOutcomePercentile } from "../lib/outcomePercentile.js";

const dist = { floor: 100, median: 200, ceiling: 300, gamesPerSeason: 17 };

test("null guards", () => {
  assert.equal(computeOutcomePercentile([], dist), null);
  assert.equal(computeOutcomePercentile(null, dist), null);
  assert.equal(computeOutcomePercentile([10], { ...dist, median: "x" }), null);
});

test("pace landing exactly on a known quantile", () => {
  // currentPPG such that pace = median (200) -> 50th
  const r = computeOutcomePercentile([200 / 17], dist);
  assert.equal(Math.round(r.paceSeasonTotal), 200);
  assert.equal(r.percentile, 50);
});

test("pace at the floor -> 10th, at the ceiling -> 90th", () => {
  assert.equal(computeOutcomePercentile([100 / 17], dist).percentile, 10);
  assert.equal(computeOutcomePercentile([300 / 17], dist).percentile, 90);
});

test("interpolates linearly between floor and median", () => {
  // pace = 150 -> halfway floor..median -> 30th
  assert.equal(computeOutcomePercentile([150 / 17], dist).percentile, 30);
});

test("beyond the tails: slope extended but clamped to [1, 99]", () => {
  assert.equal(computeOutcomePercentile([1000 / 17], dist).percentile, 99);
  assert.equal(computeOutcomePercentile([1 / 17], dist).percentile, 1);
});
