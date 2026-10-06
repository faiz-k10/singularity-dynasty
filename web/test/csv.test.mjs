import { test } from "node:test";
import assert from "node:assert/strict";
import { csvEscape, toCsv } from "../lib/csv.js";

test("escapes only what needs it", () => {
  assert.equal(csvEscape("plain"), "plain");
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape("two\nlines"), '"two\nlines"');
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape(undefined), "");
  assert.equal(csvEscape(12.5), "12.5");
  assert.equal(csvEscape(0), "0");
});

test("builds a header row plus one line per row", () => {
  const cols = [{ key: "a", label: "A" }, { key: "b", label: "B, with comma" }];
  assert.equal(toCsv(cols, [{ a: 1, b: "x" }, { a: null, b: "y,z" }]), 'A,"B, with comma"\n1,x\n,"y,z"');
  assert.equal(toCsv(cols, []), 'A,"B, with comma"');
});
