import test from "node:test";
import assert from "node:assert/strict";
import { isBye, BYE_LABEL } from "../lib/bye.js";

test("NA opponent means a bye week", () => {
  assert.equal(isBye("NA"), true);
  assert.equal(isBye(" na "), true);
  assert.equal(BYE_LABEL, "BYE WEEK");
});

test("real opponents, empty and missing values are not a bye", () => {
  assert.equal(isBye("KC"), false);
  assert.equal(isBye("NE"), false);
  assert.equal(isBye(""), false);
  assert.equal(isBye(null), false);
  assert.equal(isBye(undefined), false);
});
