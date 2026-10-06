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

test("missed games pull the pace down when the team's games are known", () => {
  // 32.4 points in 2 games, but his team has played 4: 32.4 / 4 * 17 = 137.7
  const r = computeOutcomePercentile([17.7, 14.7], { ...dist, gamesElapsed: 4 });
  assert.equal(Math.round(r.paceSeasonTotal * 10) / 10, 137.7);
  assert.equal(r.gamesPlayed, 2);
  // same games with no missed games is the plain per-game pace
  const healthy = computeOutcomePercentile([17.7, 14.7], { ...dist, gamesElapsed: 2 });
  assert.equal(Math.round(healthy.paceSeasonTotal * 10) / 10, 275.4);
});

test("gamesElapsed never goes below games played, and bad values fall back", () => {
  const base = computeOutcomePercentile([10, 20], dist).paceSeasonTotal;
  for (const bad of [undefined, null, 0, -3, NaN, "4"]) {
    assert.equal(computeOutcomePercentile([10, 20], { ...dist, gamesElapsed: bad }).paceSeasonTotal, base);
  }
  assert.equal(computeOutcomePercentile([10, 20], { ...dist, gamesElapsed: 1 }).paceSeasonTotal, base);
});
