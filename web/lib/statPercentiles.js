// Shared by both Player Season Simulations and its Compare Players view --
// pulled out here so the two never drift (see the interpolation/full-pool
// fixes below, which both pages need identically).
// Stats where MORE ranks LOWER. Empty since Nov 9 2026 (founder): interceptions now read like every other stat, more = a higher percentile.
export const INVERTED_STATS = new Set([]);

// Share of a position pool that a value beats, as an interpolated 0-100
// rank rather than a plain count of pool members strictly below it --
// linearly interpolates within whatever gap a value falls into whenever
// the value isn't itself a pool member. invert flips "higher raw value =
// higher percentile" for stats where more is actually worse
// (none right now, see INVERTED_STATS).
//
// Ties rank at the bottom of their own tied block (rank = count strictly
// below), not the block's midpoint -- a value literally cannot "beat" a
// player it's tied with, so it shouldn't get credit as if it did.
// Averaging across the tie (the previous approach) reads as statistically
// principled but produces misleading numbers for a stat where the same
// value is extremely common: 0 receiving TDs, say, tied with most of a
// combined floor/median/ceiling pool, doesn't read as "34th percentile"
// under this rule -- it reads as 0th, correctly, since nothing in the
// pool is actually below it. The tradeoff is symmetric at the top: many
// players tied for the pool's actual maximum won't individually show
// 100th unless the max is unique to them, only "beats everyone who isn't
// also at the max" -- accurate to what the number is supposed to mean,
// just less flattering than crediting a tie as if it were a win.
// A pool is ranked against many times (every row x every stat), so each pool's sorted copy is made ONCE and remembered (keyed by the array itself and
// rebuilt if its length changes), and the "how many are below / above" counts are binary searches -- it used to re-sort the whole pool on every call,
// which made a page of a few hundred rows spend most of its server time sorting.
const sortedPools = new WeakMap();
function sortedPool(pool, invert) {
  let entry = sortedPools.get(pool);
  if (!entry || entry.len !== pool.length) {
    entry = { len: pool.length };
    sortedPools.set(pool, entry);
  }
  const key = invert ? "inv" : "asc";
  return (entry[key] ??= pool.map((v) => (invert ? -v : v)).sort((a, b) => a - b));
}
// Number of elements strictly below v (lower bound) / at or below v (upper bound) in an ascending array.
function boundIndex(sorted, v, inclusive) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (inclusive ? sorted[mid] <= v : sorted[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function percentileRank(value, pool, invert = false) {
  if (!pool || pool.length <= 1) return null;
  const sorted = sortedPool(pool, invert);
  const v = invert ? -value : value;
  const n = sorted.length;
  const below = boundIndex(sorted, v, false);
  const above = n - boundIndex(sorted, v, true);
  const tied = n - below - above;

  let rank;
  if (tied > 0) {
    rank = below;
  } else {
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

// One pool per position+stat key, built from whatever rows are passed in
// -- callers MUST pass an always-untruncated row set (not a teaser-
// limited one), since percentile math comparing one player against "the
// position" has to mean the whole position regardless of which viewer is
// looking. A teaser-truncated pool can silently drop whichever player
// anchors one end of a position's stat range, which then reads as a
// wrong/confusing percentile for anyone still in the visible pool near
// that end. Every player's floor, median, AND ceiling all go into the
// same pool -- see computeStatPercentiles below for why.
export function buildStatPoolByPos(rows) {
  const statPoolByPos = {};
  for (const row of rows) {
    if (!row.stat_ranges) continue;
    const pool = (statPoolByPos[row.position] ??= {});
    for (const [key, range] of Object.entries(row.stat_ranges)) {
      const combined = (pool[key] ??= []);
      combined.push(range.floor, range.median, range.ceiling);
    }
  }
  return statPoolByPos;
}

// Per-stat {statPercentiles, statFloorPercentiles, statCeilingPercentiles}
// for one row, ranked against statPoolByPos. Floor, median, and ceiling
// all rank against the SAME combined pool (every player's floor, median,
// and ceiling values for that stat, pooled together) instead of three
// separate same-layer pools -- one full spectrum of "what any player's
// outcome for this stat might look like," rather than three parallel but
// disconnected rankings. This also sidesteps percentileRank's top-end
// extrapolation problem: since every player's actual ceiling is itself a
// member of the pool, a high ceiling never has to be clamped against a
// pool that stops short of it the way ranking ceilings against a
// medians-only pool once did (e.g. two very different ceilings both
// reading as a flat 100th percentile).
export function computeStatPercentiles(row, statPoolByPos) {
  const statPercentiles = {};
  const statFloorPercentiles = {};
  const statCeilingPercentiles = {};
  if (row.stat_ranges) {
    const statPool = statPoolByPos[row.position];
    for (const [key, range] of Object.entries(row.stat_ranges)) {
      const pool = statPool?.[key];
      const invert = INVERTED_STATS.has(key);
      statPercentiles[key] = percentileRank(range.median, pool, invert);
      statFloorPercentiles[key] = percentileRank(range.floor, pool, invert);
      statCeilingPercentiles[key] = percentileRank(range.ceiling, pool, invert);
    }
  }
  return { statPercentiles, statFloorPercentiles, statCeilingPercentiles };
}
