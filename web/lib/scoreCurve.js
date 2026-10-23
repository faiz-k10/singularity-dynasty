// Geometry for app/my-team/ScoreCurve.js's outcome curve (a lineup row's floor / median / ceiling hump with the scored
// points as a marker on it; the number itself is written in the row's own Pts cell). Pure -- no React -- so the maths is unit-tested (test/scoreCurve.test.mjs). Fixed
// (not scaled to the week's widest range like the table's curve) so every row lines up and the three numbers always
// have room: the labels sit under the floor edge, the peak and the ceiling edge, and the peak is kept off the edges.
export const W = 168;
export const H = 48;
export const MARGIN = 6;
export const TAIL = 20;
export const PEAK_Y = 7;
export const BASE_Y = 29;
export const LABEL_Y = 43; // floor / median / ceiling numbers
export const TAIL_H = 0.32; // tail wedge height as a fraction of the hump's
export const SAMPLES = 16;
// W is the width at the usual size; a wider row (the board with its right pane folded) draws a wider curve of the SAME height by passing a bigger w to
// curveGeometry, so the hump stretches while the labels, marker and wedges keep their size.
export const X_FLOOR = MARGIN + TAIL;

export function peakFraction(floor, median, ceiling) {
  const span = ceiling - floor;
  if (!(span > 0)) return 0.5;
  return Math.min(0.75, Math.max(0.25, (median - floor) / span));
}

// Cosine hump from the peak (x0, PEAK_Y) down to the baseline at x1.
export function hump(x0, x1) {
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    pts.push([x0 + (x1 - x0) * t, BASE_Y - (0.5 + 0.5 * Math.cos(Math.PI * t)) * (BASE_Y - PEAK_Y)]);
  }
  return pts;
}

// The geometry for one player's range -- exported so the marker maths can be tested.
export function curveGeometry(floor, median, ceiling, w = W) {
  const X_CEIL = w - MARGIN - TAIL;
  const xPeak = X_FLOOR + peakFraction(floor, median, ceiling) * (X_CEIL - X_FLOOR);
  const tailY = BASE_Y - TAIL_H * (BASE_Y - PEAK_Y);
  // x for a score: linear across the floor-to-ceiling hump (bent at the median so the peak sits at the median), then
  // across the tails -- below the floor the whole way down to 0 points fills the red wedge, above the ceiling the
  // blue wedge holds half a floor-to-ceiling range more.
  const xOf = (pts) => {
    if (pts <= floor) {
      const room = Math.max(floor, 2);
      return X_FLOOR - TAIL * Math.min(1, (floor - pts) / room);
    }
    if (pts >= ceiling) {
      const room = Math.max((ceiling - floor) / 2, 2);
      return X_CEIL + TAIL * Math.min(1, (pts - ceiling) / room);
    }
    if (pts <= median) return X_FLOOR + ((pts - floor) / Math.max(median - floor, 0.01)) * (xPeak - X_FLOOR);
    return xPeak + ((pts - median) / Math.max(ceiling - median, 0.01)) * (X_CEIL - xPeak);
  };
  // Height of the drawn outline at x, so the dot sits ON the curve.
  const yAt = (x) => {
    if (x < X_FLOOR) return BASE_Y - ((x - (X_FLOOR - TAIL)) / TAIL) * (BASE_Y - tailY);
    if (x > X_CEIL) return BASE_Y - (((X_CEIL + TAIL) - x) / TAIL) * (BASE_Y - tailY);
    const [a, b] = x <= xPeak ? [X_FLOOR, xPeak] : [xPeak, X_CEIL];
    const t = x <= xPeak ? (xPeak - x) / Math.max(xPeak - a, 0.01) : (x - xPeak) / Math.max(b - xPeak, 0.01);
    return BASE_Y - (0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) * (BASE_Y - PEAK_Y);
  };
  return { xPeak, tailY, xOf, yAt, xCeil: X_CEIL };
}


export const fmt = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
export const f1 = (v) => v.toFixed(1);

// The curve's drawn width in viewBox units for a rendered width in px: the usual W until the curve is wider than its usual maximum (182px), then it
// grows in step with the width -- so the rendered height stays the same (52px) and only the hump gets wider.
export const USUAL_PX = 182;
export const viewWidth = (px) => Math.max(W, Math.round((px * W) / USUAL_PX));
