import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRegressionScore } from "../lib/regressionScore.js";

test("null guards", () => {
  assert.equal(computeRegressionScore([], 15), null);
  assert.equal(computeRegressionScore(null, 15), null);
  assert.equal(computeRegressionScore([10, 20], "15"), null);
  assert.equal(computeRegressionScore([10, 20], NaN), null);
  assert.equal(computeRegressionScore([10, 20], Infinity), null);
});

test("hot start: ahead of pace -> positive score", () => {
  // 4 games, 25 ppg actual, projected 15 ppg -> (100) - (60) = +40
  const r = computeRegressionScore([25, 25, 25, 25], 15);
  assert.equal(r.gamesPlayed, 4);
  assert.equal(r.currentPPG, 25);
  assert.equal(r.projectedPPG, 15);
  assert.equal(r.regressionScore, 40);
});

test("cold start: behind pace -> negative score", () => {
  const r = computeRegressionScore([8, 8, 8, 8, 8], 14);
  // 40 actual - 70 pace = -30
  assert.equal(r.regressionScore, -30);
});

test("on pace -> ~0", () => {
  const r = computeRegressionScore([12, 18, 12, 18], 15);
  assert.equal(r.regressionScore, 0);
});

test("score scales with games played (not a per-game normalized figure)", () => {
  const twoIn = computeRegressionScore([25, 25], 15).regressionScore; // +20
  const eightIn = computeRegressionScore(Array(8).fill(25), 15).regressionScore; // +80
  assert.equal(twoIn, 20);
  assert.equal(eightIn, 80);
});
