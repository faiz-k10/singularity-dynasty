import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveTier, skyPlanGrant, stackBonus } from "../lib/subscriptionTier.js";

test("Night Sky plan time: a bonus tier counts only while it lasts and never lowers a paid tier", () => {
  const now = Date.UTC(2026, 10, 19);
  const later = new Date(now + 86_400_000).toISOString(), past = new Date(now - 1).toISOString();
  assert.equal(effectiveTier("stargazer", "explorer", later, now), "explorer");
  assert.equal(effectiveTier("stargazer", "explorer", past, now), "stargazer");
  assert.equal(effectiveTier("singularity", "explorer", later, now), "singularity");
  assert.equal(effectiveTier("explorer", "bogus", later, now), "explorer");
  assert.equal(effectiveTier(undefined, null, null, now), "stargazer");
});

test("Night Sky plan time: what the week and the month give for each plan", () => {
  assert.deepEqual(skyPlanGrant("week", "stargazer", false), { bonus: "explorer", days: 7 });
  assert.deepEqual(skyPlanGrant("week", "explorer", true), { bonus: "singularity", days: 7 });
  assert.deepEqual(skyPlanGrant("week", "singularity", true), { credit: 583 });
  assert.deepEqual(skyPlanGrant("month", "stargazer", false), { bonus: "explorer", days: 30 });
  assert.deepEqual(skyPlanGrant("month", "explorer", true), { credit: 900 });
  assert.deepEqual(skyPlanGrant("month", "singularity", true), { credit: 2500 });
  assert.equal(skyPlanGrant("year", "explorer", true), null);
});

test("Night Sky plan time: the same tier extends a running bonus, a different one starts now", () => {
  const now = Date.UTC(2026, 10, 19), D = 86_400_000;
  const running = { bonus_tier: "explorer", bonus_until: new Date(now + 3 * D).toISOString() };
  assert.equal(stackBonus(running, { bonus: "explorer", days: 30 }, now).bonus_until, new Date(now + 33 * D).toISOString());
  assert.equal(stackBonus(running, { bonus: "singularity", days: 7 }, now).bonus_until, new Date(now + 7 * D).toISOString());
  assert.equal(stackBonus({ bonus_tier: "explorer", bonus_until: new Date(now - D).toISOString() }, { bonus: "explorer", days: 7 }, now).bonus_until, new Date(now + 7 * D).toISOString());
});
