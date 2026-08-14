// Shared by PlayerSimSearch.js (the per-row expand) and
// ComparePlayerRadars.js (the Compare Players view) -- both need the same
// per-position vertex order so a given stat lands on the same radar
// position regardless of which page it's viewed from.
//
// Per-position vertex order for the radar, chosen so a fixed clockwise-
// from-top layout (see StatRadar's angleFor) lands specific stats on
// specific vertices: index 0 is the top vertex, 1 upper-right, 2 lower-
// right, 3 lower-left, 4 upper-left. QB/RB pentagons read left-to-right
// as upper-left/top/upper-right for the 3 "top" stats (indices 4/0/1)
// and lower-left/lower-right for the 2 "bottom" stats (indices 3/2);
// WR/TE triangles are flipped point-down via RADAR_START_DEG so index 0
// lands at the bottom instead.
export const RADAR_ORDER = {
  QB: ["passing_interceptions", "passing_yards", "rushing_yards", "rushing_tds", "passing_tds"],
  RB: ["receptions", "receiving_yards", "rushing_yards", "rushing_tds", "receiving_tds"],
  WR: ["receiving_tds", "receiving_yards", "receptions"],
  TE: ["receiving_tds", "receiving_yards", "receptions"],
};
export const RADAR_START_DEG = { WR: 90, TE: 90 };

export function radarLayoutFor(entries, position) {
  const order = RADAR_ORDER[position];
  if (!order) return { entries, startDeg: -90 };
  const byKey = new Map(entries.map((entry) => [entry[0], entry]));
  const ordered = order.map((key) => byKey.get(key)).filter(Boolean);
  const leftover = entries.filter(([key]) => !order.includes(key));
  return { entries: [...ordered, ...leftover], startDeg: RADAR_START_DEG[position] ?? -90 };
}
