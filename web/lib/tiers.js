// Gap-based tiering: sort players by the chosen metric and start a new
// tier wherever the drop to the next player is unusually large relative
// to the other gaps in that same list, rather than a fixed player-count
// per tier.
//
// Two threshold strategies, picked by pool size:
//
// - mean gap + 1.5 stdev, for the small per-position pools (~30-85
//   players) computeTierMaps uses. Validated across several rounds of
//   real tuning on those pool sizes.
// - median gap + 3 * MAD (median absolute deviation), for the large
//   global POR pool (425 players) computeGlobalTierMap uses. Mean/stdev
//   is an outlier magnet at that size: a handful of huge gaps between
//   elite players at the very top inflate the stdev so much the
//   threshold stops triggering for the rest of the list entirely --
//   verified on the real POR pool, where mean+stdev produced a real
//   break every ~5 players in the top 24, then dumped the remaining 402
//   into one "Tier 6" spanning POR +75 down to -150, well past several
//   real drop-offs. Median/MAD is the standard robust fix: half the
//   gaps are literally unaffected by how extreme the other half get, so
//   outlier gaps at the top can't silently raise the bar for everyone
//   below them. Tried on the smaller per-position pools too, but it ran
//   the other way there -- too loose, collapsing e.g. 31 QBs from ~5
//   real tiers down to 3. So it's scoped to the large-pool case only,
//   not a universal replacement for mean+stdev.
const METRICS = ["floor", "median", "ceiling"];

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function meanStdevThreshold(gaps) {
  const meanGap = gaps.reduce((s, g) => s + g, 0) / (gaps.length || 1);
  const variance = gaps.reduce((s, g) => s + (g - meanGap) ** 2, 0) / (gaps.length || 1);
  return meanGap + 1.5 * Math.sqrt(variance);
}

function medianMadThreshold(gaps) {
  const medianGap = median(gaps);
  const mad = median(gaps.map((g) => Math.abs(g - medianGap)));
  return medianGap + 3 * mad * 1.4826;
}

function groupByGaps(arr, metric, thresholdFn) {
  const gaps = [];
  for (let i = 1; i < arr.length; i++) {
    gaps.push(arr[i - 1][metric] - arr[i][metric]);
  }
  const threshold = thresholdFn(gaps);

  const groups = [[arr[0]]];
  for (let i = 1; i < arr.length; i++) {
    const gap = arr[i - 1][metric] - arr[i][metric];
    if (gap > threshold && gap > 0) {
      groups.push([arr[i]]);
    } else {
      groups[groups.length - 1].push(arr[i]);
    }
  }
  return groups;
}

// A lone player stranded in their own tier reads as noise unless they're
// truly a class apart -- fold them into whichever neighboring tier they're
// numerically closer to. The very top tier is exempt: a real "alone at
// the top" standout (a clear position-1 with real separation) is a
// legitimate, expected tier shape, not something to paper over.
function mergeSingletons(groups, metric) {
  let i = 1;
  while (i < groups.length) {
    if (groups[i].length !== 1) {
      i++;
      continue;
    }
    const value = groups[i][0][metric];
    const prevGap = value !== undefined ? groups[i - 1][groups[i - 1].length - 1][metric] - value : Infinity;
    const nextGap = i < groups.length - 1 ? value - groups[i + 1][0][metric] : Infinity;

    if (prevGap <= nextGap) {
      groups[i - 1].push(groups[i][0]);
    } else {
      groups[i + 1].unshift(groups[i][0]);
    }
    groups.splice(i, 1);
    // Re-check the same index -- the merge may have left a new adjacency
    // that itself now needs evaluating (rare, but cheap to be safe about).
  }
  return groups;
}

// floor/median/ceiling are raw stat totals -- a QB's median is on a wholly
// different scale than a TE's, so tiering has to happen separately within
// each position or the whole thing just reflects position, not tier.
export function computeTierMaps(poolRows) {
  const byPos = {};
  for (const row of poolRows) {
    (byPos[row.position] ??= []).push(row);
  }

  const tierByName = { floor: {}, median: {}, ceiling: {} };

  for (const metric of METRICS) {
    for (const pos in byPos) {
      const arr = [...byPos[pos]].sort((a, b) => b[metric] - a[metric]);
      if (arr.length === 0) continue;

      const groups = mergeSingletons(groupByGaps(arr, metric, meanStdevThreshold), metric);
      groups.forEach((group, tierIndex) => {
        for (const player of group) {
          tierByName[metric][player.player_name] = tierIndex + 1;
        }
      });
    }
  }

  return tierByName;
}

// POR is already position-adjusted -- each player's score is measured
// against his OWN position's replacement level, which is exactly what
// makes it comparable ACROSS positions (that's the whole point of the
// stat). Tiering it per-position like the raw stats above would silently
// re-introduce a position axis into a number specifically built to not
// have one, and produces exactly the nonsense a viewer would (rightly)
// flag: two players 2 points apart landing in different tiers because
// they happen to play different positions. So POR tiers are computed
// once, across the whole pool, with no position grouping at all.
export function computeGlobalTierMap(poolRows, metric) {
  const arr = [...poolRows].sort((a, b) => b[metric] - a[metric]);
  if (arr.length === 0) return {};

  const groups = mergeSingletons(groupByGaps(arr, metric, medianMadThreshold), metric);
  const tierByName = {};
  groups.forEach((group, tierIndex) => {
    for (const player of group) {
      tierByName[player.player_name] = tierIndex + 1;
    }
  });
  return tierByName;
}
