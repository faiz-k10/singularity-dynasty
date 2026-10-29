import test from "node:test";
import assert from "node:assert/strict";
import { ageOn, formatHeight } from "../lib/format.js";

test("ageOn: years with one decimal from a birth date; null when there is none", () => {
  const now = Date.parse("2026-10-24");
  assert.equal(ageOn("2001-04-24", now), "25.5");
  assert.equal(ageOn("2000-10-24", now), "26.0");
  assert.equal(ageOn(null, now), null);
  assert.equal(ageOn("not a date", now), null);
});

test("formatHeight: inches, 6-1 and 6'1\" all become feet and inches; nothing usable is null", () => {
  assert.equal(formatHeight("71"), "5'11\"");
  assert.equal(formatHeight(75), "6'3\"");
  assert.equal(formatHeight("6-1"), "6'1\"");
  assert.equal(formatHeight("6'1\""), "6'1\"");
  assert.equal(formatHeight(null), null);
  assert.equal(formatHeight("0"), null);
});
