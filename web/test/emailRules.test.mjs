import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, maskEmail } from "../lib/emailRules.js";

test("normalizeEmail: trims, lower-cases, rejects the obviously wrong", () => {
  assert.equal(normalizeEmail("  Jo.Smith+ff@Gmail.COM "), "jo.smith+ff@gmail.com");
  for (const bad of ["", "jo", "jo@", "@gmail.com", "jo@gmail", "jo smith@gmail.com", "jo@gmail.c", null, "a".repeat(250) + "@x.com"]) {
    assert.equal(normalizeEmail(bad), null, String(bad).slice(0, 20));
  }
});

test("maskEmail: recognisable, not readable", () => {
  assert.equal(maskEmail("jonathan@gmail.com"), "jo******@gmail.com");
  assert.equal(maskEmail("ab@x.io"), "ab*@x.io");
  assert.equal(maskEmail("nope"), "");
});
