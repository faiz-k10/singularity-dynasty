import test from "node:test";
import assert from "node:assert/strict";
import { ageOn } from "../lib/format.js";

test("ageOn: years with one decimal from a birth date; null when there is none", () => {
  const now = Date.parse("2026-10-24");
  assert.equal(ageOn("2001-04-24", now), "25.5");
  assert.equal(ageOn("2000-10-24", now), "26.0");
  assert.equal(ageOn(null, now), null);
  assert.equal(ageOn("not a date", now), null);
});
