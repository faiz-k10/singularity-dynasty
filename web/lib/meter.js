// How full a compare meter is for one player (0-1), shared by Compare Players and Compare Simulations (founder, Nov 22 2026): a
// higher-is-better number against the row's top value (from zero, or from the lowest when a number can go negative), a
// lower-is-better one (rank, INT) as the best value over his, so the row's leader always has a full meter.
export function meterShare(values, v, best = "high") {
  if (v == null) return 0;
  const have = values.filter((x) => x != null);
  if (best === "low") {
    const min = Math.min(...have);
    return v <= 0 ? 1 : Math.max(0, min) / v;
  }
  const lo = Math.min(0, ...have), hi = Math.max(...have);
  return hi > lo ? (v - lo) / (hi - lo) : 0;
}

export const meterWidth = (values, v, best) => `${(meterShare(values, v, best) * 100).toFixed(1)}%`;
