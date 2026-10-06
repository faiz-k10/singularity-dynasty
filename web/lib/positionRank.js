// Position rank (QB1, WR12, ...) for every row of one week's simulation pool:
// the player's place among his own position when the pool is ordered by
// median, highest first -- the same ordering the Player Season Simulations
// table uses for the little number beside the position. Ties break by name so
// the result is stable.
export function positionRanks(rows) {
  const ordered = [...rows].sort((a, b) => b.median - a.median || a.player_name.localeCompare(b.player_name));
  const counters = {};
  const out = {};
  for (const r of ordered) {
    counters[r.position] = (counters[r.position] || 0) + 1;
    out[r.player_name] = counters[r.position];
  }
  return out;
}
