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

test("computePortfolioSummary: top exposure is the player rostered on the most teams", async () => {
  const rows = [
    { name: "A", teams: 3, exposurePct: 75, simFloor: 5, simCeiling: 20 },
    { name: "B", teams: 1, exposurePct: 25, simFloor: 10, simCeiling: 12 },
  ];
  const result = await computePortfolioSummary(rows);
  assert.equal(result.totalPlayers, 2);
  assert.equal(result.totalSlots, 4);
  assert.equal(result.topExposure.name, "A");
});

test("computePortfolioSummary: spikyPct counts roster slots, not distinct players", async () => {
  const rows = [
    { name: "Spiky", teams: 3, simFloor: 4, simCeiling: 20 }, // 5x -> spiky
    { name: "Safe", teams: 1, simFloor: 10, simCeiling: 12 }, // 1.2x -> not spiky
  ];
  const result = await computePortfolioSummary(rows);
  // 3 spiky slots out of 4 rated slots = 75%
  assert.equal(result.spikyPct, 75);
});

test("computePortfolioSummary: players with no sim data are excluded from spikyPct, not treated as safe", async () => {
  const rows = [{ name: "No Sim Data", teams: 5, simFloor: null, simCeiling: null }];
  const result = await computePortfolioSummary(rows);
  assert.equal(result.spikyPct, null);
});

test("computePortfolioSummary: empty/missing rows -> zeros, not a crash", async () => {
  assert.deepEqual(await computePortfolioSummary([]), {
    totalPlayers: 0, totalSlots: 0, topExposure: null, spikyPct: null,
  });
  assert.deepEqual(await computePortfolioSummary(undefined), {
    totalPlayers: 0, totalSlots: 0, topExposure: null, spikyPct: null,
  });
});

test("registerInsight: rejects an invalid scope so a typo fails loudly, not silently", () => {
  assert.throws(() => registerInsight({ key: "bad", scope: "nope", compute: () => {} }));
});

test("getInsight: unknown key fails loudly rather than returning undefined", () => {
  assert.throws(() => getInsight("does_not_exist_xyz"));
});
