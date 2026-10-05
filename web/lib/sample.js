// n random picks (with replacement) from `pool`. Lives outside the
// component file because Math.random in a component body trips React's
// purity lint; the ticker WANTS a fresh shuffle on every render.
export function sampleWithReplacement(pool, n) {
  return Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)]);
}
