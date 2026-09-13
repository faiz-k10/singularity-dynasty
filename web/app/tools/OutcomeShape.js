// Small inline curve replacing a flat 3-segment bar for "safe vs spiky":
// an illustrative outcome-distribution silhouette built entirely from
// numbers the row already carries -- floor/median/ceiling (real 10th/
// 50th/90th percentile simulation output) position the peak, bust_pct/
// boom_pct (real share of simulated seasons landing 20%+ below/above the
// player's own median -- migration
// 0018_player_simulations_add_boom_bust.sql) control how far each side's
// hump reaches before it decays back to baseline. Not a literal density
// curve (we don't have one -- only three quantile points plus two
// tail-mass percentages), but every input is real, and a safe player's
// low bust/boom share draws as a compact hump that decays well before
// the edge, while a volatile player's high share draws as a hump
// stretching most of the way there -- the empty space (or lack of it) IS
// the signal, same honest-illustration spirit as the flat Range bar it
// sits next to.
//
// Left half = downside (bust), right half = upside (boom) -- colored to
// match the Range bar's own blue/gold split (.sim-bar-typical/-upside)
// so the two visual-distribution columns read as one family.
const WIDTH = 130;
const HEIGHT = 34;
const MARGIN_X = 6;
const PEAK_Y = 5;
const BASE_Y = 30;
const SAMPLES = 14; // per side -- smooth enough at this size, cheap to compute

// Real skew signal: where the median actually sits between floor and
// ceiling (not always the midpoint -- fantasy outcome distributions
// usually skew right, median closer to floor than ceiling). Clamped so
// neither side ever collapses to a sliver for an extreme skew.
function medianFraction(floor, median, ceiling) {
  const span = ceiling - floor;
  if (!(span > 0)) return 0.5;
  return Math.min(0.82, Math.max(0.18, (median - floor) / span));
}

// How far a side's hump reaches (as a fraction of its half-width) before
// decaying to baseline -- higher bust/boom % reaches further out, i.e. a
// wider hump with real mass out there; low % decays fast, leaving a
// compact hump and genuine empty space toward the edge. Real bust_pct/
// boom_pct in this pool run roughly 2-40%, mapped here to roughly a
// third of the half-width up to nearly the whole thing.
function reach(pct) {
  const p = typeof pct === "number" && Number.isFinite(pct) ? pct : 0;
  return Math.min(1, 0.32 + (Math.min(Math.max(p, 0), 100) / 100) * 1.6);
}

// One side's filled-hump path. xPeak/xEdge set the direction (xEdge is
// the outer margin on that side); `reachFrac` is how far toward xEdge
// the hump actually extends before flattening into baseline -- the path
// starts at that decay point (on the baseline), rises along the curve to
// the peak, drops straight back to baseline under the peak, and closes
// with a flat segment along the baseline back to the start.
function sidePath(xPeak, xEdge, reachFrac) {
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES; // 0 at peak, 1 at the point the curve reaches baseline
    const h = 0.5 + 0.5 * Math.cos(Math.PI * t); // 1 at peak -> 0 at baseline
    const x = xPeak + (xEdge - xPeak) * reachFrac * t;
    const y = BASE_Y - h * (BASE_Y - PEAK_Y);
    pts.push([x, y]);
  }
  const outward = pts
    .slice()
    .reverse()
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`);
  return `M${outward[0]} L${outward.slice(1).join(" L")} L${xPeak.toFixed(1)},${BASE_Y.toFixed(1)} Z`;
}

export default function OutcomeShape({ floor, median, ceiling, bustPct, normalPct, boomPct }) {
  if (![floor, median, ceiling].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return null;
  }
  const xPeak = MARGIN_X + medianFraction(floor, median, ceiling) * (WIDTH - 2 * MARGIN_X);
  const leftPath = sidePath(xPeak, MARGIN_X, reach(bustPct));
  const rightPath = sidePath(xPeak, WIDTH - MARGIN_X, reach(boomPct));

  const title =
    bustPct != null && normalPct != null && boomPct != null
      ? `Outcome shape — ${Math.round(bustPct)}% of simulated seasons land 20%+ below his own median (bust), ${Math.round(normalPct)}% land within 20% (normal), ${Math.round(boomPct)}% land 20%+ above (boom).`
      : "Outcome shape — no boom/bust breakdown published for this player.";

  return (
    <svg
      className="outcome-shape"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <path className="outcome-shape-bust" d={leftPath} />
      <path className="outcome-shape-boom" d={rightPath} />
      <line
        className="outcome-shape-peak"
        x1={xPeak}
        x2={xPeak}
        y1={PEAK_Y}
        y2={BASE_Y}
      />
    </svg>
  );
}
