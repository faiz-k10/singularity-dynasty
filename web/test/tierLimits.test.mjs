import { test } from "node:test";
import assert from "node:assert/strict";
import { SAVED_TEAM_LIMITS, savedTeamLimit } from "../lib/tierLimits.js";

test("savedTeamLimit: known tiers", () => {
  assert.equal(savedTeamLimit("stargazer"), 1);
  assert.equal(savedTeamLimit("explorer"), 10);
  assert.equal(savedTeamLimit("singularity"), null, "unlimited");
});

test("savedTeamLimit: null (unlimited) must not fall through to the stargazer cap", () => {
  // The bug this guards: `SAVED_TEAM_LIMITS[tier] ?? stargazer` would turn
  // a real `null` (unlimited) into 1. Paid tiers must stay uncapped.
  assert.equal(savedTeamLimit("singularity"), null);
  assert.notEqual(savedTeamLimit("singularity"), SAVED_TEAM_LIMITS.stargazer);
  assert.ok(savedTeamLimit("explorer") > SAVED_TEAM_LIMITS.stargazer);
});

test("savedTeamLimit: unknown / missing tier -> stargazer cap", () => {
  assert.equal(savedTeamLimit("bogus"), 1);
  assert.equal(savedTeamLimit(undefined), 1);
  assert.equal(savedTeamLimit(null), 1);
  assert.equal(savedTeamLimit(""), 1);
});

test("SAVED_TEAM_LIMITS shape stays in sync with the pricing copy", () => {
  assert.deepEqual(Object.keys(SAVED_TEAM_LIMITS).sort(), ["explorer", "singularity", "stargazer"]);
});
