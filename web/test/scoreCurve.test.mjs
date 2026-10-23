import { test } from "node:test";
import assert from "node:assert/strict";
import { curveGeometry, viewWidth, W } from "../lib/scoreCurve.js";

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

test("a wider curve (the board with its right pane folded) keeps the same shape rules: edges at the new width, the median on the peak", () => {
  const w = 336;
  const { xOf, xPeak, xCeil } = curveGeometry(5, 12, 30, w);
  assert.equal(xCeil, w - 6 - 20);
  assert.ok(Math.abs(xOf(12) - xPeak) < 0.01);
  assert.ok(xOf(0) >= 6 - 0.01 && xOf(100) <= w - 6 + 0.01);
  assert.equal(curveGeometry(5, 12, 30).xCeil, W - 6 - 20, "the usual width is unchanged");
});

test("viewWidth: the usual width up to 182px rendered, then it grows in step so the height stays the same", () => {
  assert.equal(viewWidth(0), W);
  assert.equal(viewWidth(117), W);
  assert.equal(viewWidth(182), W);
  assert.equal(viewWidth(364), 336);
});
