// Gap-based tiering: within each position, sort players by the chosen
// metric (floor/median/ceiling) and start a new tier wherever the drop to
// the next player is unusually large relative to that position's other
// gaps (mean gap + 1 stdev), rather than a fixed player-count per tier.
// Computed separately per metric since the *shape* of the drop-offs
// differs -- a QB's ceiling column clusters differently than its floor
// column, so a QB2/QB3 tier line by ceiling isn't necessarily the same
// line by floor.
const METRICS = ["floor", "median", "ceiling"];

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

      const gaps = [];
      for (let i = 1; i < arr.length; i++) {
        gaps.push(arr[i - 1][metric] - arr[i][metric]);
      }
      const meanGap = gaps.reduce((s, g) => s + g, 0) / (gaps.length || 1);
      const variance = gaps.reduce((s, g) => s + (g - meanGap) ** 2, 0) / (gaps.length || 1);
      const threshold = meanGap + Math.sqrt(variance);

      let tier = 1;
      tierByName[metric][arr[0].player_name] = tier;
      for (let i = 1; i < arr.length; i++) {
        const gap = arr[i - 1][metric] - arr[i][metric];
        if (gap > threshold && gap > 0) tier++;
        tierByName[metric][arr[i].player_name] = tier;
      }
    }
  }

  return tierByName;
}
