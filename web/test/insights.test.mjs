import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreGmArchetype } from "../lib/insights/gmArchetype.js";
import { computeSeasonRecordBadge } from "../lib/insights/seasonRecord.js";
import { computePortfolioSummary } from "../lib/insights/portfolioSummary.js";
import { registerInsight, getInsight } from "../lib/insights/registry.js";

test("scoreGmArchetype: all-aggressive answers land on the top archetype", () => {
  const result = scoreGmArchetype({ window: 2, riskInDraft: 2, tradeStyle: 2, benchStash: 2 });
  assert.equal(result.key, "boom_bust_gambler");
  assert.equal(result.score, 8);
});

test("scoreGmArchetype: all-patient answers land on the bottom archetype", () => {
  const result = scoreGmArchetype({ window: -2, riskInDraft: -2, tradeStyle: -2, benchStash: -2 });
  assert.equal(result.key, "patient_architect");
  assert.equal(result.score, -8);
});

test("scoreGmArchetype: missing answers count as 0, not a crash", () => {
  const result = scoreGmArchetype({ window: 1 });
  assert.equal(result.score, 1);
  assert.equal(result.key, "opportunist");
});

test("computeSeasonRecordBadge: tiers by win count", async () => {
  assert.equal((await computeSeasonRecordBadge({ settings: { record: "11-2" } })).tier, "gold");
  assert.equal((await computeSeasonRecordBadge({ settings: { record: "8-5" } })).tier, "silver");
  assert.equal((await computeSeasonRecordBadge({ settings: { record: "4-9" } })).tier, "bronze");
  assert.equal((await computeSeasonRecordBadge({ settings: { record: "2-11" } })).tier, null);
});

test("computeSeasonRecordBadge: missing settings default to 0-0, not a crash", async () => {
  const result = await computeSeasonRecordBadge();
  assert.equal(result.record, "0-0");
  assert.equal(result.tier, null);
});

test("computePortfolioSummary: topExposure is the top 5 by team count, descending", async () => {
  const rows = [
    { name: "A", teams: 3, exposurePct: 75, simFloor: 5, simCeiling: 20 },
    { name: "B", teams: 1, exposurePct: 25, simFloor: 10, simCeiling: 12 },
    { name: "C", teams: 2, exposurePct: 50, simFloor: 10, simCeiling: 12 },
  ];
  const result = await computePortfolioSummary(rows);
  assert.equal(result.totalPlayers, 3);
  assert.equal(result.totalSlots, 6);
  assert.deepEqual(result.topExposure.map((r) => r.name), ["A", "C", "B"]);
});

test("computePortfolioSummary: topExposure caps at 5 even with a bigger portfolio", async () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    name: `P${i}`, teams: 8 - i, exposurePct: (8 - i) * 10,
  }));
  const result = await computePortfolioSummary(rows);
  assert.equal(result.topExposure.length, 5);
  assert.equal(result.topExposure[0].name, "P0");
});

test("computePortfolioSummary: profile buckets weight by roster slots, not distinct players", async () => {
  const rows = [
    { name: "Gambler", teams: 3, simFloor: 4, simCeiling: 20 }, // 5x -> boomBust
    { name: "Safe", teams: 1, simFloor: 10, simCeiling: 11 }, // 1.1x -> bedrock
  ];
  const result = await computePortfolioSummary(rows);
  const byKey = Object.fromEntries(result.profile.map((b) => [b.key, b.pct]));
  // 3 boomBust slots + 1 bedrock slot out of 4 rated slots
  assert.equal(byKey.boomBust, 75);
  assert.equal(byKey.bedrock, 25);
  assert.equal(byKey.balanced, 0);
});

test("computePortfolioSummary: five buckets are covered end to end by ratio", async () => {
  const rows = [
    { name: "A", teams: 1, simFloor: 10, simCeiling: 11 },   // 1.1x -> bedrock
    { name: "B", teams: 1, simFloor: 10, simCeiling: 13 },   // 1.3x -> floorSafe
    { name: "C", teams: 1, simFloor: 10, simCeiling: 17 },   // 1.7x -> balanced
    { name: "D", teams: 1, simFloor: 10, simCeiling: 24 },   // 2.4x -> ceilingChaser
    { name: "E", teams: 1, simFloor: 10, simCeiling: 30 },   // 3.0x -> boomBust
  ];
  const result = await computePortfolioSummary(rows);
  const byKey = Object.fromEntries(result.profile.map((b) => [b.key, b.pct]));
  assert.equal(byKey.bedrock, 20);
  assert.equal(byKey.floorSafe, 20);
  assert.equal(byKey.balanced, 20);
  assert.equal(byKey.ceilingChaser, 20);
  assert.equal(byKey.boomBust, 20);
});

test("computePortfolioSummary: profile percentages always sum to exactly 100", async () => {
  // Ratios chosen so independent rounding of all five would NOT sum to 100.
  const rows = [
    { name: "A", teams: 1, simFloor: 10, simCeiling: 11 },
    { name: "B", teams: 1, simFloor: 10, simCeiling: 13 },
    { name: "C", teams: 1, simFloor: 10, simCeiling: 17 },
    { name: "D", teams: 3, simFloor: 10, simCeiling: 24 },
    { name: "E", teams: 5, simFloor: 10, simCeiling: 30 },
  ];
  const result = await computePortfolioSummary(rows);
  const sum = result.profile.reduce((s, b) => s + b.pct, 0);
  assert.equal(sum, 100);
});

test("computePortfolioSummary: no bucket ever goes negative, even when the other four's independent rounding already exceeds 100", async () => {
  // Real bug, caught live: a 4/23/45/14/14 split (weighted by roster
  // slots) independently rounds to 0/28/56/17 for the first four
  // buckets -- already 101 -- which the old "last bucket absorbs the
  // remainder" approach turned into Boom/Bust: -1%.
  const rows = [
    { name: "Bedrock", teams: 4, simFloor: 10, simCeiling: 11 },      // 1.1x
    { name: "FloorSafe", teams: 23, simFloor: 10, simCeiling: 13 },   // 1.3x
    { name: "Balanced", teams: 45, simFloor: 10, simCeiling: 17 },    // 1.7x
    { name: "Chaser", teams: 14, simFloor: 10, simCeiling: 24 },      // 2.4x
    { name: "Gambler", teams: 14, simFloor: 10, simCeiling: 30 },     // 3.0x
  ];
  const result = await computePortfolioSummary(rows);
  for (const b of result.profile) {
    assert.ok(b.pct >= 0, `${b.key} went negative: ${b.pct}`);
  }
  const sum = result.profile.reduce((s, b) => s + b.pct, 0);
  assert.equal(sum, 100);
});

test("computePortfolioSummary: players with no sim data are excluded from the profile, not treated as safe", async () => {
  const rows = [{ name: "No Sim Data", teams: 5, simFloor: null, simCeiling: null }];
  const result = await computePortfolioSummary(rows);
  assert.equal(result.profile, null);
});

test("computePortfolioSummary: empty/missing rows -> zeros, not a crash", async () => {
  assert.deepEqual(await computePortfolioSummary([]), {
    totalPlayers: 0, totalSlots: 0, topExposure: [], profile: null,
  });
  assert.deepEqual(await computePortfolioSummary(undefined), {
    totalPlayers: 0, totalSlots: 0, topExposure: [], profile: null,
  });
});

test("registerInsight: rejects an invalid scope so a typo fails loudly, not silently", () => {
  assert.throws(() => registerInsight({ key: "bad", scope: "nope", compute: () => {} }));
});

test("getInsight: unknown key fails loudly rather than returning undefined", () => {
  assert.throws(() => getInsight("does_not_exist_xyz"));
});
