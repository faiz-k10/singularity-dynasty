// "Where does this value stand in a pool": 1 + how many pool values beat it (ties share the better rank). A pool is ranked against once per player per
// number, so its sorted copy is made once and each lookup is a binary search instead of a pass over the whole pool (a page of ~500 players x ~35 numbers
// was ~8 million comparisons). `lowerIsBetter` flips what "beats" means (sack rate, where the LOWEST is best).
const sortedPools = new WeakMap();
export function rankIn(pool, v, lowerIsBetter = false) {
  let entry = sortedPools.get(pool);
  if (!entry || entry.len !== pool.length) {
    entry = { len: pool.length, asc: pool.slice().sort((a, b) => a - b) };
    sortedPools.set(pool, entry);
  }
  const s = entry.asc;
  let lo = 0;
  let hi = s.length;
  if (lowerIsBetter) {
    // count of values strictly below v
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (s[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return 1 + lo;
  }
  // count of values strictly above v = length - (count at or below v)
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (s[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return 1 + (s.length - lo);
}
