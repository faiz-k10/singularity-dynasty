import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReplacementValues } from "../lib/replacementValue.js";

// composite = 0.25*floor + 0.5*median + 0.25*ceiling
const mk = (name, position, median, spread = 0) => ({
  player_name: name,
  position,
  floor: median - spread,
  median,
  ceiling: median + spread,
});

test("POR is composite minus the position's replacement baseline; best player is most positive", () => {
  // 40 QBs, medians 200 down to 6 (step ~5)
  const qbs = Array.from({ length: 40 }, (_, i) => mk(`QB${i + 1}`, "QB", 200 - i * 5));
  const por = computeReplacementValues(qbs, { teams: 12, superflex: false });

  assert.ok(por["QB1"] > 0, "the QB1 is well above replacement");
  assert.ok(por["QB40"] < 0, "a QB40 is below replacement");
  // monotonic: better median => higher POR
  assert.ok(por["QB1"] > por["QB10"]);
  assert.ok(por["QB10"] > por["QB25"]);
});

test("superflex pushes the QB replacement line down, raising every QB's POR", () => {
  const qbs = Array.from({ length: 40 }, (_, i) => mk(`QB${i + 1}`, "QB", 200 - i * 4));
  const single = computeReplacementValues(qbs, { teams: 12, superflex: false });
  const superflex = computeReplacementValues(qbs, { teams: 12, superflex: true });
  assert.ok(superflex["QB1"] > single["QB1"], "same player worth more vs a deeper replacement");
});

test("league size scales the replacement rank (smaller league -> deeper baseline -> lower POR)", () => {
  const wrs = Array.from({ length: 80 }, (_, i) => mk(`WR${i + 1}`, "WR", 250 - i * 2));
  const twelve = computeReplacementValues(wrs, { teams: 12 });
  const ten = computeReplacementValues(wrs, { teams: 10 });
  assert.ok(ten["WR1"] < twelve["WR1"]);
});

test("thin position: fewer players than the cutoff still yields finite numbers", () => {
  const tes = [mk("TE1", "TE", 180), mk("TE2", "TE", 120), mk("TE3", "TE", 90)];
  const por = computeReplacementValues(tes, { teams: 12 });
  for (const te of ["TE1", "TE2", "TE3"]) {
    assert.ok(Number.isFinite(por[te]), `${te} POR is finite`);
  }
  assert.ok(por["TE1"] > por["TE3"]);
});

test("composite weighting: median counts double vs floor/ceiling", () => {
  // two players, same median, one with a fat symmetric range -> identical composite
  const rows = [mk("A", "RB", 150, 0), mk("B", "RB", 150, 60), mk("filler", "RB", 10)];
  const por = computeReplacementValues(rows, { teams: 12 });
  assert.equal(por["A"], por["B"], "symmetric spread doesn't move the composite");
});
