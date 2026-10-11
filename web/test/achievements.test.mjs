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

// ---- xFP badges: Honorable (last 2, at-or-above) and Con Artist (last 3, strictly below) ----
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

test("Honorable is unchanged: at-or-above xFP in both of the last 2", () => {
  assert.equal(xfpTrend2([g(12, 10), g(10, 10)]), "honorable");
  assert.equal(xfpTrend2([g(12, 10), g(9, 10)]), null);
  assert.equal(xfpTrend2([g(12, 10), g(10, 10), g(1, 9)]), "honorable"); // an older miss doesn't matter
});
