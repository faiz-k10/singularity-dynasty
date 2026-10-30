import { test } from "node:test";
import assert from "node:assert/strict";
import { spreadFlag, SPREAD_CUTOFFS, PROJECTION_FLOOR, onFireFlag, onThinIceFlag } from "../app/tools/achievements.js";

// ratio = (ceiling - floor) / projection; floor/ceiling chosen so ratio is exact.
const flag = (ratio, pos, proj = 10) => spreadFlag(0, ratio * proj, proj, pos);

test("spreadFlag keeps the base rule: ratio over projection, volatile on top, locked on bottom, else none", () => {
  assert.equal(flag(SPREAD_CUTOFFS.WR.volatile, "WR"), "volatile");
  assert.equal(flag(SPREAD_CUTOFFS.WR.locked, "WR"), "locked");
  assert.equal(flag(1.8, "WR"), null);
});

test("spreadFlag cutoffs are per position: the same ratio can be volatile for a QB but ordinary for a TE", () => {
  assert.equal(flag(1.8, "QB"), "volatile");
  assert.equal(flag(1.8, "TE"), null);
  assert.equal(flag(1.1, "QB"), null);
  assert.equal(flag(1.1, "TE"), "locked");
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

// ---- xFP badges: Honorable (4 of the last 5 at-or-above) and Con Artist (4 of the last 5 strictly below) ----
import { xfpTrend, XFP_WINDOW, XFP_NEEDED } from "../app/tools/achievements.js";
const g = (pts, xfp) => ({ fantasy_points_ppr: pts, exp_points_ppr: xfp });
const below = () => g(5, 8), above = () => g(12, 9);

test("the rule is 4 of the last 5", () => assert.deepEqual([XFP_NEEDED, XFP_WINDOW], [4, 5]));

test("Con Artist: 4 or 5 of the last 5 games below xFP, not 3", () => {
  assert.equal(xfpTrend([below(), below(), below(), below(), below()]), "conArtist");
  assert.equal(xfpTrend([below(), above(), below(), below(), below()]), "conArtist"); // one good game is forgiven
  assert.equal(xfpTrend([below(), above(), below(), above(), below()]), null); // 3 of 5
  assert.equal(xfpTrend([below(), below(), below(), below(), below(), above()]), "conArtist"); // an older game doesn't matter
});

test("Honorable: 4 or 5 of the last 5 games at or above xFP (a tie counts), not 3", () => {
  assert.equal(xfpTrend([above(), above(), g(10, 10), above(), above()]), "honorable");
  assert.equal(xfpTrend([above(), below(), above(), above(), above()]), "honorable"); // one miss is forgiven
  assert.equal(xfpTrend([above(), below(), above(), below(), above()]), null);
});

test("fewer than 5 logged games earns neither", () => {
  assert.equal(xfpTrend([below(), below(), below(), below()]), null);
  assert.equal(xfpTrend([above(), above(), above(), above()]), null);
});

test("either badge is voided by missing xFP in any of the 5 games", () => {
  const gap = { fantasy_points_ppr: 10, exp_points_ppr: null };
  assert.equal(xfpTrend([above(), above(), gap, above(), above()]), null);
  assert.equal(xfpTrend([below(), below(), gap, below(), below()]), null);
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

import { getAchievements } from "../app/tools/achievements.js";

test("Matchup badge follows the row's defLean: SMASH -> Smash Spot, AVOID -> Tough Spot, none -> no badge", () => {
  const pick = (row) => getAchievements(row).find((a) => a.key === "matchup");
  const smash = pick({ defLean: { call: "SMASH", text: "why" } });
  assert.equal(smash.variant, "smash");
  assert.equal(smash.label, "Smash Spot");
  assert.equal(smash.text, "why");
  const tough = pick({ defLean: { call: "AVOID", text: "why" } });
  assert.equal(tough.variant, "tough");
  assert.equal(tough.label, "Tough Spot");
  assert.equal(pick({}), undefined);
});

const game = (pts, extra = {}) => ({ fantasy_points_ppr: pts, floor: 5, ceiling: 25, median: 12, exp_points_ppr: 12, ...extra });

test("On Fire: two straight games at or over the ceiling, not one", () => {
  assert.equal(onFireFlag([game(26), game(25)]), true);
  assert.equal(onFireFlag([game(26), game(10)]), false);
  assert.equal(onFireFlag([game(26)]), false);
  assert.equal(onFireFlag([game(26), game(25, { ceiling: null })]), false);
});

test("On Thin Ice: two straight games at or under the floor, not one", () => {
  assert.equal(onThinIceFlag([game(5), game(2)]), true);
  assert.equal(onThinIceFlag([game(5), game(10)]), false);
  assert.equal(onThinIceFlag([game(2)]), false);
  assert.equal(onThinIceFlag([game(2), game(3, { floor: null })]), false);
});

test("the three-game xFP-and-median path is unchanged", () => {
  assert.equal(onThinIceFlag([game(8), game(9), game(7)]), true);
  assert.equal(onFireFlag([game(15), game(16), game(14)]), true);
  assert.equal(onThinIceFlag([game(8), game(9), game(13)]), false);
});
