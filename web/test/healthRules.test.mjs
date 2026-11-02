import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth } from "../lib/healthRules.js";

const now = Date.parse("2026-11-04T12:00:00Z");
const daysAgo = (d) => new Date(now - d * 86_400_000).toISOString();
const base = { now, nfl: { season_type: "regular", week: 9 }, rankingsPublishedAt: daysAgo(1), simsPublishedAt: daysAgo(1), gameLogWeek: 8, errorsLastHour: 0 };

test("healthy in season", () => {
  const h = evaluateHealth(base);
  assert.equal(h.ok, true);
  assert.equal(h.checks.length, 4);
});

test("a missed Tuesday run is stale after 7.5 days", () => {
  assert.equal(evaluateHealth({ ...base, rankingsPublishedAt: daysAgo(7) }).ok, true);
  const h = evaluateHealth({ ...base, rankingsPublishedAt: daysAgo(8) });
  assert.equal(h.ok, false);
  assert.equal(h.checks.find((c) => !c.ok).name, "Weekly rankings");
  assert.equal(evaluateHealth({ ...base, simsPublishedAt: null }).ok, false);
});

test("game log may trail by two weeks, not three", () => {
  assert.equal(evaluateHealth({ ...base, gameLogWeek: 7 }).ok, true);
  assert.equal(evaluateHealth({ ...base, gameLogWeek: 6 }).ok, false);
});

test("an error spike fails; an unreadable error log does not", () => {
  assert.equal(evaluateHealth({ ...base, errorsLastHour: 25 }).ok, false);
  assert.equal(evaluateHealth({ ...base, errorsLastHour: null }).ok, true);
});

test("off season: old data is expected", () => {
  const h = evaluateHealth({ ...base, nfl: { season_type: "off", week: 0 }, rankingsPublishedAt: daysAgo(90), simsPublishedAt: daysAgo(90), gameLogWeek: null });
  assert.equal(h.ok, true);
  assert.equal(h.inSeason, false);
});
