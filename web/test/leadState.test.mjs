import { test } from "node:test";
import assert from "node:assert/strict";
import { leadState } from "../lib/leadState.js";

test("leadState: higher score leads, lower trails, a tie or unknown score is neither", () => {
  assert.deepEqual(leadState(53.6, 96.7), ["trail", "lead"]);
  assert.deepEqual(leadState(96.7, 53.6), ["lead", "trail"]);
  assert.deepEqual(leadState(0, 0), [null, null]);
  assert.deepEqual(leadState(12.3, 12.3), [null, null]);
  assert.deepEqual(leadState(null, 5), [null, null]);
  assert.deepEqual(leadState(undefined, undefined), [null, null]);
});
