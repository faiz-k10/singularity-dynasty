import test from "node:test";
import assert from "node:assert/strict";
import { rankIn } from "../lib/rank.js";

test("rankIn: 1 + how many beat it, ties share the better rank; lowerIsBetter flips it", () => {
  const pool = [10, 20, 20, 30];
  assert.equal(rankIn(pool, 30), 1);
  assert.equal(rankIn(pool, 20), 2);
  assert.equal(rankIn(pool, 10), 4);
  assert.equal(rankIn(pool, 25), 2, "a value between members");
  assert.equal(rankIn(pool, 5), 5);
  assert.equal(rankIn(pool, 10, true), 1);
  assert.equal(rankIn(pool, 20, true), 2);
  assert.equal(rankIn(pool, 30, true), 4);
});

test("rankIn: identical to the naive count on random pools, including after the pool grows", () => {
  let seed = 99;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let r = 0; r < 200; r++) {
    const pool = Array.from({ length: 1 + Math.floor(rnd() * 80) }, () => Math.round(rnd() * 30) / 2);
    for (let k = 0; k < 30; k++) {
      const v = Math.round(rnd() * 34 - 2) / 2;
      assert.equal(rankIn(pool, v), 1 + pool.filter((x) => x > v).length);
      assert.equal(rankIn(pool, v, true), 1 + pool.filter((x) => x < v).length);
    }
    pool.push(7);
    assert.equal(rankIn(pool, 7), 1 + pool.filter((x) => x > 7).length);
  }
});
