// Up to n random picks from `pool`, never the same player twice (by `name`), skipping any name in `taken`.
// Lives outside the component file because Math.random in a component body trips React's purity lint; the ticker WANTS a fresh shuffle on every render.
export function sampleUnique(pool, n, taken = new Set()) {
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const out = [];
  for (const item of a) {
    if (out.length >= n) break;
    if (taken.has(item.name)) continue;
    taken.add(item.name);
    out.push(item);
  }
  return out;
}
