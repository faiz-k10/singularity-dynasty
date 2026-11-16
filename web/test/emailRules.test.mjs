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

import { cleanName, cleanQuizAnswers } from "../lib/emailRules.js";
import { tooFast } from "../lib/turnstile.js";

test("cleanName keeps real names and refuses links / markup", () => {
  assert.equal(cleanName("  Mary  Ann "), "Mary Ann");
  assert.equal(cleanName("O'Brien-Smith"), "O'Brien-Smith");
  assert.equal(cleanName("José"), "José");
  assert.equal(cleanName(""), null);
  assert.equal(cleanName("http://spam.com"), null);
  assert.equal(cleanName("<b>x</b>"), null);
  assert.equal(cleanName("a".repeat(41)), null);
});

test("cleanQuizAnswers needs every question answered with one of its own options", () => {
  const qs = [{ key: "a", options: [{ value: 2 }, { value: -2 }] }, { key: "b", options: [{ value: 1 }] }];
  assert.deepEqual(cleanQuizAnswers({ a: "2", b: 1, x: 9 }, qs), { a: 2, b: 1 });
  assert.equal(cleanQuizAnswers({ a: 2 }, qs), null);
  assert.equal(cleanQuizAnswers({ a: 3, b: 1 }, qs), null);
  assert.equal(cleanQuizAnswers(null, qs), null);
});

test("tooFast flags a form sent within 2.5s of appearing, and passes a missing time", () => {
  assert.equal(tooFast(1000, 2000), true);
  assert.equal(tooFast(1000, 4000), false);
  assert.equal(tooFast("", 4000), false);
  assert.equal(tooFast("abc", 4000), false);
});
