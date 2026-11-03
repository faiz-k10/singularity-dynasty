import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubStops, nearestStop } from "../lib/scrubStops.js";

test("stops are every earlier snapshot week, then the page's latest week", () => {
  assert.deepEqual(scrubStops([1, 2, 3, 4, 5, 6, 7, 8], 8), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("a snapshot list that ends a week short still reaches W7 and W8 separately (the Nov 3 2026 bug)", () => {
  const stops = scrubStops([1, 2, 3, 4, 5, 6, 7], 8);
  assert.deepEqual(stops, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(nearestStop(stops, 7), 7);
  assert.equal(nearestStop(stops, 8), 8);
});

test("a snapshot list that runs past the page's latest week is trimmed to it", () => {
  assert.deepEqual(scrubStops([1, 2, 3, 4], 3), [1, 2, 3]);
});

test("no snapshots yet means no stops; duplicates and order do not matter", () => {
  assert.deepEqual(scrubStops([], 8), []);
  assert.deepEqual(scrubStops(undefined, 8), []);
  assert.deepEqual(scrubStops([3, 1, 2, 2], 4), [1, 2, 3, 4]);
});

test("nearestStop picks the closest stop", () => {
  assert.equal(nearestStop([1, 2, 5, 8], 4), 5);
  assert.equal(nearestStop([1, 2, 5, 8], 7), 8);
  assert.equal(nearestStop([], 3), null);
});
