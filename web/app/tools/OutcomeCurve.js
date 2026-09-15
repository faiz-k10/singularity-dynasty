// Weekly Projection Rankings' outcome curve -- floor/ceiling (this
// week's real 10th/96th percentile quantiles, migration 0029) anchor
// three zones: below this week's floor, the floor-to-ceiling range
// itself, and above this week's ceiling. The floor tail is red and the
// ceiling tail stays the original blue -- matching the Floor column's
// own red heat-tint (.heat-cell-floor) so "floor" reads as the same
// color wherever it shows up on this page, not just two generic
// "outside the range" wedges anymore.
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
//
// IMPORTANT: medianFraction (below) is (median-floor)/(ceiling-floor) --
// a fraction of THIS ROW'S OWN range, not a shared numeric x-axis. Two
// rows' peaks are not positionally comparable: a player with a low
// floor/ceiling whose median sits high *within that low range* can peak
// further right than a player with a much higher absolute median whose
// value happens to sit nearer the middle of their own (higher) range.
// That's why every peak carries its own printed median value (see the
// dot + label below) -- the only way to actually compare two curves'
// central tendency is by that number, never by eyeballing peak position
// against each other.
const WIDTH = 130;
const HEIGHT = 44;
const MARGIN_X = 4;
const TAIL_PX = 18; // fixed width for each "beyond the projected range" wedge
const TAIL_HEIGHT_FRAC = 0.32; // tail wedge height, as a fraction of the peak's height
const LABEL_Y = 9; // baseline for the peak-value label, above the hump
const PEAK_Y = 15;
const BASE_Y = 40;
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
  // A narrower middle zone than midWidthMax frees up leftover width --
  // split it evenly onto both tails (instead of dumping it all onto the
  // right tail) so the two tails stay equal-length and the whole curve
  // stays centered, only the tail thickness growing as span shrinks.
  const extraPerSide = (midWidthMax - midWidth) / 2;
  const xFloor = MARGIN_X + TAIL_PX + extraPerSide;
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

  // Label x is clamped independently of xPeak so the printed number
  // never clips past the svg's edge, even when the peak itself sits
  // near xFloor/xCeiling (medianFraction is clamped to [0.15, 0.85],
  // but that's still close enough to the tails at narrow spans).
  const xLabel = Math.min(WIDTH - MARGIN_X - 14, Math.max(MARGIN_X + 14, xPeak));

  const title =
    `Floor ${floor.toFixed(1)} to ceiling ${ceiling.toFixed(1)} this week, median ${median.toFixed(1)} ` +
    `(marked by the dot) — width shown relative to the widest range in this week's pool. Peak position is ` +
    `relative to this row's own range, not a shared axis, so it isn't comparable to another row's peak position.`;

  return (
    <svg className="outcome-curve" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
      <title>{title}</title>
      <path className="outcome-curve-tail-floor" d={leftTailPath} />
      <path className="outcome-curve-tail-ceiling" d={rightTailPath} />
      <path className="outcome-curve-middle" d={middlePath} />
      <circle className="outcome-curve-peak-dot" cx={xPeak} cy={PEAK_Y} r={1.8} />
      <text className="outcome-curve-peak-label" x={xLabel} y={LABEL_Y} textAnchor="middle">
        {median.toFixed(1)}
      </text>
    </svg>
  );
}
