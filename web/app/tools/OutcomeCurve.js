// Weekly Projection Rankings' outcome curve -- floor/ceiling (this
// week's real 10th/96th percentile quantiles, migration 0029) anchor
// three zones: below this week's floor, the floor-to-ceiling range
// itself, and above this week's ceiling. Two colors, not three: the two
// tail zones (below floor, above ceiling) share one color, since they're
// the same idea in either direction -- "outside the range actually
// projected" -- while the floor-to-ceiling range itself gets the other.
//
// The middle zone's WIDTH is scaled against the widest floor-to-ceiling
// range in this week's pool (maxSpread, computed once server-side) --
// so a volatile/wide-range player draws a wide middle with thin tails, a
// locked-in/narrow-range player draws a narrow middle with generous
// tails on both sides. That's real information (the two numbers already
// printed in the Floor/Ceiling columns), just made comparable at a
// glance instead of read as two separate digits.
//
// The peak inside the middle sits at the real fraction of that range
// `median` (this row's weekly projection -- not its own visible column
// anymore, but still the number `rank`/floor/ceiling are all built from)
// falls at, so it isn't always centered -- weekly distributions usually
// skew toward the ceiling side. The tails themselves are a fixed, modest
// triangular taper, NOT data-derived -- unlike Player Season
// Simulations' boom/bust shares, there's no per-player tail-mass number
// at the weekly grain to draw them from, so they're kept deliberately
// generic rather than implying a precision that isn't there.
const WIDTH = 130;
const HEIGHT = 34;
const MARGIN_X = 4;
const TAIL_PX = 18; // fixed width for each "beyond the projected range" wedge
const TAIL_HEIGHT_FRAC = 0.32; // tail wedge height, as a fraction of the peak's height
const PEAK_Y = 5;
const BASE_Y = 30;
const SAMPLES = 14;
const MIN_MIDDLE_PX = 14; // floor for the middle zone so it never fully vanishes

function medianFraction(floor, median, ceiling) {
  const span = ceiling - floor;
  if (!(span > 0)) return 0.5;
  return Math.min(0.85, Math.max(0.15, (median - floor) / span));
}

function fmt(x, y) {
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

// Smooth cosine hump, peak at (xPeak, PEAK_Y) down to baseline at
// (xEdge, BASE_Y) -- used for both halves of the middle zone.
function humpHalf(xPeak, xEdge) {
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const h = 0.5 + 0.5 * Math.cos(Math.PI * t);
    pts.push([xPeak + (xEdge - xPeak) * t, BASE_Y - h * (BASE_Y - PEAK_Y)]);
  }
  return pts;
}

export default function OutcomeCurve({ floor, median, ceiling, maxSpread }) {
  if (![floor, median, ceiling].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return null;
  }
  const span = ceiling - floor;
  if (!(span > 0) || !(maxSpread > 0)) return null;

  const midWidthMax = WIDTH - 2 * MARGIN_X - 2 * TAIL_PX;
  const midWidth = Math.max(MIN_MIDDLE_PX, midWidthMax * Math.min(1, span / maxSpread));
  const xFloor = MARGIN_X + TAIL_PX;
  const xCeiling = xFloor + midWidth;
  const xPeak = xFloor + medianFraction(floor, median, ceiling) * midWidth;

  const left = humpHalf(xPeak, xFloor).reverse(); // xFloor(base) -> ... -> xPeak
  const right = humpHalf(xPeak, xCeiling); // xPeak -> ... -> xCeiling(base)
  const middlePoints = [...left, ...right.slice(1)];
  const middlePath =
    `M${fmt(middlePoints[0][0], BASE_Y)} ` +
    `L${middlePoints.map(([x, y]) => fmt(x, y)).join(" L")} ` +
    `L${fmt(middlePoints[middlePoints.length - 1][0], BASE_Y)} Z`;

  const tailY = BASE_Y - TAIL_HEIGHT_FRAC * (BASE_Y - PEAK_Y);
  const leftTailPath = `M${fmt(xFloor, BASE_Y)} L${fmt(xFloor, tailY)} L${fmt(MARGIN_X, BASE_Y)} Z`;
  const rightTailPath = `M${fmt(xCeiling, BASE_Y)} L${fmt(xCeiling, tailY)} L${fmt(WIDTH - MARGIN_X, BASE_Y)} Z`;

  const title = `Floor ${floor.toFixed(1)} to ceiling ${ceiling.toFixed(1)} this week — width shown relative to the widest range in this week's pool.`;

  return (
    <svg className="outcome-curve" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
      <title>{title}</title>
      <path className="outcome-curve-tail" d={leftTailPath} />
      <path className="outcome-curve-tail" d={rightTailPath} />
      <path className="outcome-curve-middle" d={middlePath} />
    </svg>
  );
}
