// Larger, fully-labeled version of OutcomeCurve.js used only inside a
// Weekly Projection Rankings row's expanded detail panel (WeeklyDetailRow)
// -- the inline table cell stays the small, label-free curve exactly as it
// was before the peak-label experiment (see git history: "Revert
// peak-value label..."). This is a separate component, not a `size` prop
// on OutcomeCurve, so the two can't drift into affecting each other and
// the dense inline table never risks the extra vertical room this needs.
//
// Shares the exact same geometry/scaling logic as OutcomeCurve.js (the
// symmetric-tail fix included) at ~3x the size, plus three labels the
// small version deliberately omits: the median value at the peak, and
// the floor/ceiling values at each tail's outer edge -- "all the labels"
// the small curve's tooltip already describes in words.
const WIDTH = 440;
const HEIGHT = 130;
const MARGIN_X = 14;
const TAIL_PX = 60;
const TAIL_HEIGHT_FRAC = 0.32;
const PEAK_Y = 34;
const BASE_Y = 104;
const SAMPLES = 24;
const MIN_MIDDLE_PX = 40;
const MEDIAN_LABEL_Y = 18; // above the peak dot
const END_LABEL_Y = BASE_Y + 22; // below the baseline, under each tail

function medianFraction(floor, median, ceiling) {
  const span = ceiling - floor;
  if (!(span > 0)) return 0.5;
  return Math.min(0.85, Math.max(0.15, (median - floor) / span));
}

function fmt(x, y) {
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

function humpHalf(xPeak, xEdge) {
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const h = 0.5 + 0.5 * Math.cos(Math.PI * t);
    pts.push([xPeak + (xEdge - xPeak) * t, BASE_Y - h * (BASE_Y - PEAK_Y)]);
  }
  return pts;
}

export default function OutcomeCurveDetail({ floor, median, ceiling, maxSpread }) {
  if (![floor, median, ceiling].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return null;
  }
  const span = ceiling - floor;
  if (!(span > 0) || !(maxSpread > 0)) return null;

  const midWidthMax = WIDTH - 2 * MARGIN_X - 2 * TAIL_PX;
  const midWidth = Math.max(MIN_MIDDLE_PX, midWidthMax * Math.min(1, span / maxSpread));
  const extraPerSide = (midWidthMax - midWidth) / 2;
  const xFloor = MARGIN_X + TAIL_PX + extraPerSide;
  const xCeiling = xFloor + midWidth;
  const xPeak = xFloor + medianFraction(floor, median, ceiling) * midWidth;

  const left = humpHalf(xPeak, xFloor).reverse();
  const right = humpHalf(xPeak, xCeiling);
  const middlePoints = [...left, ...right.slice(1)];
  const middlePath =
    `M${fmt(middlePoints[0][0], BASE_Y)} ` +
    `L${middlePoints.map(([x, y]) => fmt(x, y)).join(" L")} ` +
    `L${fmt(middlePoints[middlePoints.length - 1][0], BASE_Y)} Z`;

  const tailY = BASE_Y - TAIL_HEIGHT_FRAC * (BASE_Y - PEAK_Y);
  const leftTailPath = `M${fmt(xFloor, BASE_Y)} L${fmt(xFloor, tailY)} L${fmt(MARGIN_X, BASE_Y)} Z`;
  const rightTailPath = `M${fmt(xCeiling, BASE_Y)} L${fmt(xCeiling, tailY)} L${fmt(WIDTH - MARGIN_X, BASE_Y)} Z`;

  // Median label x is clamped independently of xPeak so it never clips
  // past the svg's edge even when the peak sits close to a tail.
  const xMedianLabel = Math.min(WIDTH - MARGIN_X - 30, Math.max(MARGIN_X + 30, xPeak));
  const xFloorLabel = (MARGIN_X + xFloor) / 2;
  const xCeilingLabel = (xCeiling + (WIDTH - MARGIN_X)) / 2;

  const title =
    `Floor ${floor.toFixed(1)} to ceiling ${ceiling.toFixed(1)} this week, median ${median.toFixed(1)} -- ` +
    `width shown relative to the widest range in this week's pool.`;

  return (
    <svg className="outcome-curve-detail" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
      <title>{title}</title>
      <path className="outcome-curve-tail-floor" d={leftTailPath} />
      <path className="outcome-curve-tail-ceiling" d={rightTailPath} />
      <path className="outcome-curve-middle" d={middlePath} />
      <circle className="outcome-curve-peak-dot" cx={xPeak} cy={PEAK_Y} r={3.5} />
      <text className="outcome-curve-median-label" x={xMedianLabel} y={MEDIAN_LABEL_Y} textAnchor="middle">
        Median {median.toFixed(1)}
      </text>
      <text className="outcome-curve-end-label outcome-curve-end-label-floor" x={xFloorLabel} y={END_LABEL_Y} textAnchor="middle">
        Floor {floor.toFixed(1)}
      </text>
      <text className="outcome-curve-end-label outcome-curve-end-label-ceiling" x={xCeilingLabel} y={END_LABEL_Y} textAnchor="middle">
        Ceiling {ceiling.toFixed(1)}
      </text>
    </svg>
  );
}
