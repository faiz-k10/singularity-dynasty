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

// One median pool per position+stat key, built from whatever rows are
// passed in -- callers MUST pass an always-untruncated row set (not a
// teaser-limited one), since percentile math comparing one player
// against "the position" has to mean the whole position regardless of
// which viewer is looking. A teaser-truncated pool can silently drop
// whichever player anchors one end of a position's stat range, which
// then reads as a wrong/confusing percentile for anyone still in the
// visible pool near that end.
export function buildStatPoolByPos(rows) {
  const statPoolByPos = {};
  for (const row of rows) {
    if (!row.stat_ranges) continue;
    const pool = (statPoolByPos[row.position] ??= {});
    for (const [key, range] of Object.entries(row.stat_ranges)) {
      (pool[key] ??= []).push(range.median);
    }
  }
  return statPoolByPos;
}

// Per-stat {statPercentiles, statFloorPercentiles, statCeilingPercentiles}
// for one row, ranked against statPoolByPos. Floor and ceiling rank
// against the MEDIAN pool, not their own floor/ceiling pools -- floor/
// median/ceiling for one player are all draws from that same player's
// own distribution, so a better player tends to have a higher floor AND
// median AND ceiling together. Ranking each independently against its
// own similarly-shifted pool preserves that correlation and makes all
// three percentiles land nearly on top of each other for most players.
// Putting floor/ceiling on the median pool's scale instead measures "how
// does my floor/ceiling compare to peers' typical production," which
// spreads the band out to actually reflect this player's own variance.
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
