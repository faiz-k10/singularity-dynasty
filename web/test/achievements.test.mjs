import { test } from "node:test";
import assert from "node:assert/strict";
import { spreadFlag, SPREAD_CUTOFFS, PROJECTION_FLOOR } from "../app/tools/achievements.js";

// ratio = (ceiling - floor) / projection; floor/ceiling chosen so ratio is exact.
const flag = (ratio, pos, proj = 10) => spreadFlag(0, ratio * proj, proj, pos);

test("spreadFlag keeps the base rule: ratio over projection, volatile on top, locked on bottom, else none", () => {
  assert.equal(flag(SPREAD_CUTOFFS.WR.volatile, "WR"), "volatile");
  assert.equal(flag(SPREAD_CUTOFFS.WR.locked, "WR"), "locked");
  assert.equal(flag(1.8, "WR"), null);
});

test("spreadFlag cutoffs are per position: the same ratio can be volatile for a QB but ordinary for a TE", () => {
  assert.equal(flag(2.0, "QB"), "volatile");
  assert.equal(flag(2.0, "TE"), null);
  assert.equal(flag(1.3, "QB"), null);
  assert.equal(flag(1.3, "TE"), "locked");
});

test("spreadFlag eligibility is unchanged: below PROJECTION_FLOOR or missing data never earns either badge", () => {
  assert.equal(spreadFlag(0, 3, PROJECTION_FLOOR - 0.1, "QB"), null);
  assert.equal(spreadFlag(null, 20, 12, "QB"), null);
  assert.equal(spreadFlag(5, null, 12, "QB"), null);
});

test("spreadFlag falls back to pooled cutoffs for an unknown position", () => {
  assert.equal(flag(2.5, "K"), "volatile");
  assert.equal(flag(1.1, undefined), "locked");
});

// ---- xFP badges: Honorable (last 3, at-or-above) and Con Artist (last 3, strictly below) ----
import { xfpTrend2 } from "../app/tools/achievements.js";
const g = (pts, xfp) => ({ fantasy_points_ppr: pts, exp_points_ppr: xfp });

test("Con Artist needs all of the last 3 games below xFP", () => {
  assert.equal(xfpTrend2([g(8, 10), g(9, 12), g(5, 7)]), "conArtist");
  assert.equal(xfpTrend2([g(8, 10), g(9, 12), g(14, 11)]), null); // third game beat xFP
});

test("two misses are no longer enough for Con Artist", () => {
  assert.equal(xfpTrend2([g(8, 10), g(9, 12)]), null); // only 2 games
  assert.equal(xfpTrend2([g(8, 10), g(9, 12), g(14, 11), g(1, 9)]), null); // third game back beat xFP
});

test("Con Artist is voided by missing xFP in any of the 3 games", () => {
  assert.equal(xfpTrend2([g(8, 10), g(9, 12), { fantasy_points_ppr: 5, exp_points_ppr: null }]), null);
});

test("Honorable needs all of the last 3 games at or above xFP", () => {
  assert.equal(xfpTrend2([g(12, 10), g(10, 10), g(15, 11)]), "honorable"); // equal to xFP counts
  assert.equal(xfpTrend2([g(12, 10), g(10, 10), g(9, 11)]), null); // third game missed
  assert.equal(xfpTrend2([g(12, 10), g(10, 10)]), null); // only 2 games
  assert.equal(xfpTrend2([g(12, 10), g(10, 10), g(15, 11), g(1, 9)]), "honorable"); // an older miss doesn't matter
});

test("Honorable is voided by missing xFP in any of the 3 games", () => {
  assert.equal(xfpTrend2([g(12, 10), { fantasy_points_ppr: 10, exp_points_ppr: null }, g(15, 11)]), null);
});

import { buyLowFlag } from "../app/tools/achievements.js";
const bg = (pts, med, xfp) => ({ fantasy_points_ppr: pts, median: med, exp_points_ppr: xfp });

test("Buy Low needs high usage, two games under median, and at/above xFP in 2 of the last 3", () => {
  // last 2 under median (8 < 12); at/above xFP in games 1 and 3 -> fires
  assert.equal(buyLowFlag(85, [bg(8, 12, 7), bg(9, 12, 10), bg(14, 12, 11)]), true);
  // at/above xFP in only 1 of the last 3 -> the bad-player case, no badge
  assert.equal(buyLowFlag(85, [bg(8, 12, 11), bg(9, 12, 10), bg(14, 12, 15)]), false);
  // equal to xFP counts as at-or-above
  assert.equal(buyLowFlag(85, [bg(8, 12, 8), bg(9, 12, 9), bg(5, 12, 20)]), true);
});

test("Buy Low keeps its other rules: usage percentile and the below-median pair", () => {
  assert.equal(buyLowFlag(79, [bg(8, 12, 7), bg(9, 12, 8), bg(14, 12, 11)]), false); // usage too low
  assert.equal(buyLowFlag(85, [bg(13, 12, 7), bg(9, 12, 8), bg(14, 12, 11)]), false); // latest game above median
  assert.equal(buyLowFlag(85, [bg(8, 12, 7), bg(9, 12, 8)]), false); // only 2 games logged
});

test("Buy Low: a game with no xFP row does not count toward the 2", () => {
  const noXfp = { fantasy_points_ppr: 9, median: 12, exp_points_ppr: null };
  assert.equal(buyLowFlag(85, [bg(8, 12, 7), noXfp, bg(5, 12, 20)]), false); // only 1 confirmed
  assert.equal(buyLowFlag(85, [bg(8, 12, 7), noXfp, bg(14, 12, 11)]), true); // 2 confirmed
});
