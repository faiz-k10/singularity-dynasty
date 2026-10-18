import { test } from "node:test";
import assert from "node:assert/strict";
import { NFL_DIVISIONS, ALL_TEAMS } from "../lib/nflDivisions.js";

test("8 divisions of 4, 32 distinct teams, 16 per conference", () => {
  assert.equal(NFL_DIVISIONS.length, 8);
  assert.ok(NFL_DIVISIONS.every((d) => d.teams.length === 4));
  assert.equal(new Set(ALL_TEAMS).size, 32);
  assert.equal(NFL_DIVISIONS.filter((d) => d.conf === "AFC").flatMap((d) => d.teams).length, 16);
});
