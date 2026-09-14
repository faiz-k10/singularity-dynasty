import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreGmArchetype } from "../lib/insights/gmArchetype.js";
import { computeSeasonRecordBadge } from "../lib/insights/seasonRecord.js";
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

test("registerInsight: rejects an invalid scope so a typo fails loudly, not silently", () => {
  assert.throws(() => registerInsight({ key: "bad", scope: "nope", compute: () => {} }));
});

test("getInsight: unknown key fails loudly rather than returning undefined", () => {
  assert.throws(() => getInsight("does_not_exist_xyz"));
});
