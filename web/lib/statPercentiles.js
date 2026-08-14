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
// that end. Floor, median, and ceiling each get their own pool (every
// player's floor, every player's median, every player's ceiling) rather
// than sharing one -- see computeStatPercentiles below for why.
export function buildStatPoolByPos(rows) {
  const statPoolByPos = {};
  for (const row of rows) {
    if (!row.stat_ranges) continue;
    const pool = (statPoolByPos[row.position] ??= {});
    for (const [key, range] of Object.entries(row.stat_ranges)) {
      const layers = (pool[key] ??= { floor: [], median: [], ceiling: [] });
      layers.floor.push(range.floor);
      layers.median.push(range.median);
      layers.ceiling.push(range.ceiling);
    }
  }
  return statPoolByPos;
}

// Per-stat {statPercentiles, statFloorPercentiles, statCeilingPercentiles}
// for one row, ranked against statPoolByPos. Each layer ranks against its
// own layer's pool -- a ceiling of 27 has to beat other players'
// ceilings to read as elite, not other players' medians. Ranking against
// the shared median pool (the previous approach) broke down past the
// pool's own max: percentileRank's top-end extrapolation clamps to rank
// n-1 for any value beyond the last pool member, so two players with
// very different ceilings (e.g. 17 and 27 rushing TDs) could both land
// at a flat 100th percentile once both exceeded every player's median --
// intuitively wrong, since 27 is unambiguously better than 17. A
// same-layer pool doesn't have that gap: the actual ceiling values
// populate the top of the ceiling pool, so 27 outranks 17 there instead
// of both maxing out against a pool of smaller numbers.
export function computeStatPercentiles(row, statPoolByPos) {
  const statPercentiles = {};
  const statFloorPercentiles = {};
  const statCeilingPercentiles = {};
  if (row.stat_ranges) {
    const statPool = statPoolByPos[row.position];
    for (const [key, range] of Object.entries(row.stat_ranges)) {
      const layers = statPool?.[key];
      const invert = INVERTED_STATS.has(key);
      statPercentiles[key] = percentileRank(range.median, layers?.median, invert);
      statFloorPercentiles[key] = percentileRank(range.floor, layers?.floor, invert);
      statCeilingPercentiles[key] = percentileRank(range.ceiling, layers?.ceiling, invert);
    }
  }
  return { statPercentiles, statFloorPercentiles, statCeilingPercentiles };
}
