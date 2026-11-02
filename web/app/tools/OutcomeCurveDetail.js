import { ordinal } from "@/lib/format";

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
//
// Each label also carries its own percentile-vs-pool ordinal (a small,
// dimmer second line) -- this used to live only in the adjacent
// Percentiles panel as three separate Floor/Projection/Ceiling rows.
// Folding the number directly onto the point it describes removes that
// redundant panel real estate entirely (WeeklyDetailRow.js no longer
// renders those three rows) rather than showing the same three numbers
// twice in two different panels.
// Panel height is now dictated by the row's tallest column (Opponent
// Defense + Recent Games stacked, align-items:stretch), so this SVG's
// wrapper has real extra vertical room around it a fixed-size chart
// can't use on its own. Grown again (170 -> 210) with the hump's own
// height kept identical (BASE_Y - PEAK_Y stays 70) -- the point of the
// growth is bigger, more legible label text, not a taller hump -- so
// the extra room is spent shifting the whole hump down (PEAK_Y 34 -> 46)
// to free up headroom for the now-larger two-line median label above
// it, plus a wider bottom margin for the larger end labels below.
const WIDTH = 440;
const HEIGHT = 166; // just below the lowest label (END_PCT_Y + its descent); was 210, which left ~45 units of empty space under the curve
const TOP_PAD = 8; // the MEDIAN label's capitals rise ~5 units above y = 0; the drawing area starts this far above 0 so they aren't clipped
const MARGIN_X = 14;
const TAIL_PX = 60;
const TAIL_HEIGHT_FRAC = 0.32;
const PEAK_Y = 46;
const BASE_Y = 116;
const SAMPLES = 24;
const MIN_MIDDLE_PX = 40;
const MEDIAN_LABEL_Y = 14; // above the peak dot
const MEDIAN_PCT_Y = 28; // between the label and the peak dot
const END_LABEL_Y = BASE_Y + 22; // below the baseline, under each tail
const END_PCT_Y = END_LABEL_Y + 18; // percentile ordinal, one line further down

function medianFraction(floor, median, ceiling) {
  const span = ceiling - floor;
  if (!(span > 0)) return 0.5;
  return Math.min(0.85, Math.max(0.15, (median - floor) / span));
}

function fmt(x, y) {
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

// Same ordinal formatting as WeeklyDetailRow.js's own copy -- kept as its
// own small duplicate rather than an import for the same reason that
// file's tier() is a duplicate of PercentileCard's: five lines isn't
// worth threading a shared dependency between two components for.

function humpHalf(xPeak, xEdge) {
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const h = 0.5 + 0.5 * Math.cos(Math.PI * t);
    pts.push([xPeak + (xEdge - xPeak) * t, BASE_Y - h * (BASE_Y - PEAK_Y)]);
  }
  return pts;
}

export default function OutcomeCurveDetail({ floor, median, ceiling, maxSpread, floorPct, medianPct, ceilingPct }) {
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

  // Every label's x is clamped so its widest line ("100th percentile" at
  // the bigger pct-label font) never clips past the svg's edge -- 65 is
  // roughly that line's half-width at the current font sizes. Floor/
  // ceiling previously had NO clamp at all (only median did): harmless
  // at the smaller font this started at, but the bigger text from
  // growing the canvas overflowed the edge by a few px on a wide-spread
  // player (xFloor sits close to MARGIN_X at max spread, same idea on
  // the ceiling side) -- confirmed live on a wide-floor-ceiling row
  // before adding this.
  const LABEL_HALF_W = 65;
  const xMedianLabel = Math.min(WIDTH - MARGIN_X - LABEL_HALF_W, Math.max(MARGIN_X + LABEL_HALF_W, xPeak));
  const xFloorLabel = Math.max(MARGIN_X + LABEL_HALF_W, (MARGIN_X + xFloor) / 2);
  const xCeilingLabel = Math.min(WIDTH - MARGIN_X - LABEL_HALF_W, (xCeiling + (WIDTH - MARGIN_X)) / 2);

  const title =
    `Outcome curve: floor ${floor.toFixed(1)}, median ${median.toFixed(1)}, ceiling ${ceiling.toFixed(1)} points. ` +
    `Its width is drawn relative to the widest range in this week's pool.`;

  return (
    <svg className="outcome-curve-detail" viewBox={`0 ${-TOP_PAD} ${WIDTH} ${HEIGHT + TOP_PAD}`} role="img" aria-label={title}>
      <path className="outcome-curve-tail-floor" d={leftTailPath} />
      <path className="outcome-curve-tail-ceiling" d={rightTailPath} />
      <path className="outcome-curve-middle" d={middlePath} />
      <circle className="outcome-curve-peak-dot" cx={xPeak} cy={PEAK_Y} r={3.5} />
      <text className="outcome-curve-median-label" x={xMedianLabel} y={MEDIAN_LABEL_Y} textAnchor="middle">
        Median {median.toFixed(1)}
      </text>
      {typeof medianPct === "number" && (
        <text className="outcome-curve-pct-label" x={xMedianLabel} y={MEDIAN_PCT_Y} textAnchor="middle">
          {ordinal(medianPct)} percentile
        </text>
      )}
      <text className="outcome-curve-end-label outcome-curve-end-label-floor" x={xFloorLabel} y={END_LABEL_Y} textAnchor="middle">
        Floor {floor.toFixed(1)}
      </text>
      {typeof floorPct === "number" && (
        <text className="outcome-curve-pct-label" x={xFloorLabel} y={END_PCT_Y} textAnchor="middle">
          {ordinal(floorPct)} percentile
        </text>
      )}
      <text className="outcome-curve-end-label outcome-curve-end-label-ceiling" x={xCeilingLabel} y={END_LABEL_Y} textAnchor="middle">
        Ceiling {ceiling.toFixed(1)}
      </text>
      {typeof ceilingPct === "number" && (
        <text className="outcome-curve-pct-label" x={xCeilingLabel} y={END_PCT_Y} textAnchor="middle">
          {ordinal(ceilingPct)} percentile
        </text>
      )}
    </svg>
  );
}
