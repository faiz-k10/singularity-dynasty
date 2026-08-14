// Gap-based tiering: within each position, sort players by the chosen
// metric (floor/median/ceiling) and start a new tier wherever the drop to
// the next player is unusually large relative to that position's other
// gaps (mean gap + 1.5 stdev -- loose enough that ordinary bunching noise
// stays in one tier; a real standout still clears it easily), rather than
// a fixed player-count per tier. Computed separately per metric since the
// *shape* of the drop-offs differs -- a QB's ceiling column clusters
// differently than its floor column, so a QB2/QB3 tier line by ceiling
// isn't necessarily the same line by floor.
const METRICS = ["floor", "median", "ceiling"];

function groupByGaps(arr, metric) {
  const gaps = [];
  for (let i = 1; i < arr.length; i++) {
    gaps.push(arr[i - 1][metric] - arr[i][metric]);
  }
  const meanGap = gaps.reduce((s, g) => s + g, 0) / (gaps.length || 1);
  const variance = gaps.reduce((s, g) => s + (g - meanGap) ** 2, 0) / (gaps.length || 1);
  const threshold = meanGap + 1.5 * Math.sqrt(variance);

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

      const groups = mergeSingletons(groupByGaps(arr, metric), metric);
      groups.forEach((group, tierIndex) => {
        for (const player of group) {
          tierByName[metric][player.player_name] = tierIndex + 1;
        }
      });
    }
  }

  return tierByName;
}
