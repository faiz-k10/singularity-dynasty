import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth, missingWeeks } from "../lib/healthRules.js";

const now = Date.parse("2026-11-04T12:00:00Z");
const daysAgo = (d) => new Date(now - d * 86_400_000).toISOString();
const base = { now, nfl: { season_type: "regular", week: 9 }, rankingsPublishedAt: daysAgo(1), simsPublishedAt: daysAgo(1), gameLogWeek: 8, errorsLastHour: 0, simWeeks: [1, 2, 3, 4, 5, 6, 7, 8, 9], gameLogWeeks: [1, 2, 3, 4, 5, 6, 7, 8] };

test("healthy in season", () => {
  const h = evaluateHealth(base);
  assert.equal(h.ok, true);
  assert.equal(h.checks.length, 6);
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

test("a week with no rows is a failed check that names the week", () => {
  assert.deepEqual(missingWeeks([1, 2, 4, 5]), [3]);
  assert.deepEqual(missingWeeks(null), []);
  const h = evaluateHealth({ ...base, simWeeks: [1, 2, 3, 4, 5, 6, 8, 9] });
  assert.equal(h.ok, false);
  const bad = h.checks.find((c) => !c.ok);
  assert.equal(bad.name, "Season sim history");
  assert.match(bad.detail, /week 7/);
  assert.equal(evaluateHealth({ ...base, gameLogWeeks: [1, 2, 3, 5] }).checks.find((c) => !c.ok).name, "Game log history");
  assert.equal(evaluateHealth({ ...base, simWeeks: undefined, gameLogWeeks: null }).ok, true); // unread is not a failure
});
