import { test } from "node:test";
import assert from "node:assert/strict";
import { curveGeometry } from "../lib/scoreCurve.js";

test("curveGeometry: score -> x runs left to right through floor, median, ceiling", () => {
  const { xOf, xPeak } = curveGeometry(5, 12, 30);
  const xs = [0, 2.5, 5, 8, 12, 20, 30, 36, 50].map(xOf);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1], `x should not go backwards at ${i}`);
  assert.ok(Math.abs(xOf(12) - xPeak) < 0.01, "the median sits on the peak");
  assert.ok(xOf(0) >= 6 - 0.01 && xOf(100) <= 162 + 0.01, "the tails stop at the edges");
});

test("curveGeometry: the marker dot sits on the drawn hump (peak is the highest point)", () => {
  const { xOf, yAt, xPeak } = curveGeometry(3, 10, 24);
  const top = yAt(xPeak);
  for (const pts of [0, 3, 6, 10, 15, 24, 30]) assert.ok(yAt(xOf(pts)) >= top - 0.001, `${pts} should be at or below the peak`);
  assert.ok(Math.abs(top - 7) < 0.01);
});
