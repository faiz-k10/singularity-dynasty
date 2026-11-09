import { test } from "node:test";
import assert from "node:assert/strict";
import {
  percentileRank,
  buildStatPoolByPos,
  computeStatPercentiles,
  INVERTED_STATS,
} from "../lib/statPercentiles.js";

test("percentileRank: tiny / empty pool -> null", () => {
  assert.equal(percentileRank(5, null), null);
  assert.equal(percentileRank(5, [5]), null);
});

test("percentileRank: ranks by share of the pool strictly beaten", () => {
  const pool = [0, 10, 20, 30, 40];
  assert.equal(percentileRank(40, pool), 100, "beats all 4 others");
  assert.equal(percentileRank(0, pool), 0, "beats nobody");
  assert.equal(percentileRank(20, pool), 50);
});

test("percentileRank: a tie ranks at the BOTTOM of its tied block, not the midpoint", () => {
  // value tied with most of the pool and nothing below it -> 0, not ~40
  const pool = [0, 0, 0, 0, 10];
  assert.equal(percentileRank(0, pool), 0);
});

test("percentileRank: interpolates within the gap a non-member falls into", () => {
  const pool = [0, 10, 20, 30, 40];
  assert.equal(percentileRank(15, pool), 38, "between the 10 (25) and 20 (50) marks");
});

test("percentileRank: invert flips direction (more is worse)", () => {
  const pool = [0, 5, 10, 15, 20]; // interceptions
  assert.equal(percentileRank(0, pool, true), 100, "fewest INTs = best");
  assert.equal(percentileRank(20, pool, true), 0, "most INTs = worst");
  assert.ok(!INVERTED_STATS.has("passing_interceptions")); // interceptions rank like any stat (founder, Nov 9 2026)
});

test("buildStatPoolByPos + computeStatPercentiles: floor/median/ceiling all rank vs one combined pool", () => {
  const rows = [
    { position: "WR", stat_ranges: { rec_yards: { floor: 400, median: 800, ceiling: 1200 } } },
    { position: "WR", stat_ranges: { rec_yards: { floor: 200, median: 500, ceiling: 900 } } },
    { position: "WR", stat_ranges: { rec_yards: { floor: 600, median: 1000, ceiling: 1500 } } },
  ];
  const pool = buildStatPoolByPos(rows);
  assert.equal(pool.WR.rec_yards.length, 9, "3 players x floor/median/ceiling");

  const { statPercentiles, statFloorPercentiles, statCeilingPercentiles } = computeStatPercentiles(rows[2], pool);
  // rows[2] is the strongest line: its ceiling (1500) is the pool max
  assert.equal(statCeilingPercentiles.rec_yards, 100);
  assert.ok(statPercentiles.rec_yards > statFloorPercentiles.rec_yards);
});

test("computeStatPercentiles: row with no stat_ranges -> empty maps", () => {
  const { statPercentiles } = computeStatPercentiles({ position: "QB" }, {});
  assert.deepEqual(statPercentiles, {});
});

// The cached / binary-search version must give exactly the numbers the original sort-and-filter version did.
function referencePercentileRank(value, pool, invert = false) {
  if (!pool || pool.length <= 1) return null;
  const dir = invert ? -1 : 1;
  const sorted = pool.map((v) => v * dir).sort((a, b) => a - b);
  const v = value * dir;
  const n = sorted.length;
  const below = sorted.filter((x) => x < v).length;
  const above = sorted.filter((x) => x > v).length;
  const tied = n - below - above;
  let rank;
  if (tied > 0) rank = below;
  else {
    const loIdx = below - 1;
    const hiIdx = below;
    if (loIdx < 0) {
      const gap = sorted[1] - sorted[0];
      rank = gap > 0 ? Math.max(0, (v - sorted[0]) / gap) : 0;
    } else if (hiIdx >= n) {
      const gap = sorted[n - 1] - sorted[n - 2];
      rank = gap > 0 ? Math.min(n - 1, n - 2 + (v - sorted[n - 2]) / gap) : n - 1;
    } else {
      const gap = sorted[hiIdx] - sorted[loIdx];
      rank = gap > 0 ? loIdx + (v - sorted[loIdx]) / gap : loIdx;
    }
  }
  return Math.round((rank / (n - 1)) * 100);
}

test("percentileRank: identical to the original implementation on random pools, with ties, extremes, inversion and a pool that grows", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let round = 0; round < 300; round++) {
    const n = 2 + Math.floor(rnd() * 60);
    const pool = Array.from({ length: n }, () => Math.round(rnd() * 40) / (rnd() < 0.5 ? 1 : 4)); // plenty of ties
    for (let k = 0; k < 20; k++) {
      const v = k % 3 === 0 ? pool[Math.floor(rnd() * n)] : Math.round((rnd() * 50 - 5) * 10) / 10; // members, in-gap values, outside the range
      for (const invert of [false, true]) assert.equal(percentileRank(v, pool, invert), referencePercentileRank(v, pool, invert));
    }
    pool.push(Math.round(rnd() * 40)); // the remembered sort must notice the pool changed
    assert.equal(percentileRank(10, pool), referencePercentileRank(10, pool));
  }
});
