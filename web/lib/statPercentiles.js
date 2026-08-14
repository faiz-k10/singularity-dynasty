// Shared by both Player Season Simulations and its Compare Players view --
// pulled out here so the two never drift (see the interpolation/full-pool
// fixes below, which both pages need identically).
export const INVERTED_STATS = new Set(["passing_interceptions"]);

// Share of a position pool that a value beats, as an interpolated 0-100
// rank rather than a plain count of pool members strictly below it --
// linearly interpolates within whatever gap a value falls into (and
// mid-ranks exact ties), which reduces to the plain-count formula
// whenever the value is itself a pool member (the normal case for a
// median percentile, always ranked against a pool that includes its own
// value). invert flips "higher raw value = higher percentile" for stats
// where more is actually worse (interceptions).
export function percentileRank(value, pool, invert = false) {
  if (!pool || pool.length <= 1) return null;
  const dir = invert ? -1 : 1;
  const sorted = pool.map((v) => v * dir).sort((a, b) => a - b);
  const v = value * dir;
  const n = sorted.length;
  const below = sorted.filter((x) => x < v).length;
  const above = sorted.filter((x) => x > v).length;
  const tied = n - below - above;

  let rank;
  if (tied > 0) {
    rank = below + (tied - 1) / 2;
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
