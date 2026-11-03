// The stops on Player Season Simulations' week bar (pace panel). Pure, tested in test/scrubStops.test.mjs.
//
// The page knows the latest week itself (`latest`); the earlier-week snapshots come from a second request with its own caches, so the two
// can disagree for a minute after a publish. The bar must never trust the snapshot list for where "latest" is: a snapshot list that ends
// one week short once made W7 land on W8 (Nov 3 2026). So the stops are the snapshot weeks BEFORE the latest, then the latest itself.
export function scrubStops(snapWeeks, latest) {
  if (!snapWeeks?.length) return [];
  return [...new Set(snapWeeks.filter((w) => w < latest))].sort((a, b) => a - b).concat(latest);
}

// The stop closest to week `w` (a tie goes to the earlier one), or null with no stops.
export function nearestStop(stops, w) {
  if (!stops.length) return null;
  return stops.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), stops[0]);
}
