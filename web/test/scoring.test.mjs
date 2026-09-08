import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCORING_SETTINGS, isDefaultScoring, computeCustomProjection } from "../lib/scoring.js";

test("isDefaultScoring", () => {
  assert.ok(isDefaultScoring({ ppr: "full", tePremium: 0 }));
  assert.ok(!isDefaultScoring({ ppr: "half", tePremium: 0 }));
  assert.ok(!isDefaultScoring({ ppr: "full", tePremium: 0.5 }));
});

test("computeCustomProjection: null stats -> null", () => {
  assert.equal(computeCustomProjection(null, "WR", DEFAULT_SCORING_SETTINGS), null);
});

test("computeCustomProjection: WR under full / half / standard PPR", () => {
  const stats = { receiving_yards: 1000, receiving_tds: 8, receptions: 90 };
  // full PPR: 100 + 48 + 90 = 238
  assert.equal(computeCustomProjection(stats, "WR", { ppr: "full", tePremium: 0 }), 238);
  // half PPR: 100 + 48 + 45 = 193
  assert.equal(computeCustomProjection(stats, "WR", { ppr: "half", tePremium: 0 }), 193);
  // standard: 100 + 48 + 0 = 148
  assert.equal(computeCustomProjection(stats, "WR", { ppr: "standard", tePremium: 0 }), 148);
});

test("computeCustomProjection: TE premium only applies to TEs", () => {
  const stats = { receiving_yards: 700, receiving_tds: 5, receptions: 70 };
  // TE, full PPR + 0.5 premium: 70 + 30 + 70*(1.5) = 205
  assert.equal(computeCustomProjection(stats, "TE", { ppr: "full", tePremium: 0.5 }), 205);
  // same line as a WR: premium ignored -> 70 + 30 + 70 = 170
  assert.equal(computeCustomProjection(stats, "WR", { ppr: "full", tePremium: 0.5 }), 170);
});

test("computeCustomProjection: QB passing line, fixed rates", () => {
  const stats = { passing_yards: 4500, passing_tds: 35, passing_interceptions: 12 };
  // 0.04*4500 + 4*35 - 2*12 = 180 + 140 - 24 = 296
  assert.equal(computeCustomProjection(stats, "QB", DEFAULT_SCORING_SETTINGS), 296);
});

test("computeCustomProjection: missing components are skipped, not treated as 0-with-penalty", () => {
  const a = computeCustomProjection({ rushing_yards: 500 }, "RB", DEFAULT_SCORING_SETTINGS);
  assert.equal(a, 50);
  // adding an explicit null changes nothing
  const b = computeCustomProjection({ rushing_yards: 500, receiving_tds: null }, "RB", DEFAULT_SCORING_SETTINGS);
  assert.equal(b, 50);
});

test("computeCustomProjection: rounds to 1 decimal", () => {
  assert.equal(computeCustomProjection({ rushing_yards: 333 }, "RB", DEFAULT_SCORING_SETTINGS), 33.3);
});
