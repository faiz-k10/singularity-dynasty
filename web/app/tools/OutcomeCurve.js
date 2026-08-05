"use client";

import { useId, useMemo, useState } from "react";

const Z90 = 1.2816; // standard-normal z-score at the 90th percentile
const SAMPLES = 90; // line-segment resolution only -- the two-piece shape (and its kink at the median when sigmaLow != sigmaHigh) is unchanged by this
const WIDTH = 300;
const HEIGHT = 128;
const PAD_X = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 20;

// Abramowitz & Stegun 7.1.26 -- accurate to ~1.5e-7, plenty for a UI readout.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
    t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Reconstructs a smooth curve fitted so its 10th/50th/90th percentiles land
// exactly on floor/median/ceiling -- a "two-piece normal", the standard way
// to turn three percentile points into a full distribution when the two
// halves aren't equally spread (which floor/median/ceiling rarely are).
// This is a faithful reconstruction of the underlying 10,000-trial
// simulation, not a replay of it -- only the three percentiles are published.
function buildOutcomeModel(floor, median, ceiling) {
  const sigmaLow = Math.max((median - floor) / Z90, 0.5);
  const sigmaHigh = Math.max((ceiling - median) / Z90, 0.5);
  const cdf = (x) => {
    const sigma = x <= median ? sigmaLow : sigmaHigh;
    return normalCdf((x - median) / sigma);
  };
  const pdf = (x) => {
    const sigma = x <= median ? sigmaLow : sigmaHigh;
    const z = (x - median) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
  };
  const min = Math.max(0, Math.floor(median - 3.2 * sigmaLow));
  const max = Math.ceil(median + 3.2 * sigmaHigh);
  return { cdf, pdf, min, max };
}

export default function OutcomeCurve({ label, floor, median, ceiling, initialThreshold }) {
  const uid = useId();
  const model = useMemo(
    () => buildOutcomeModel(floor, median, ceiling),
    [floor, median, ceiling]
  );
  const [threshold, setThreshold] = useState(initialThreshold ?? median);

  const plotW = WIDTH - PAD_X * 2;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const baseline = PAD_TOP + plotH;
  const xToPx = (x) => PAD_X + ((x - model.min) / (model.max - model.min)) * plotW;

  const linePoints = useMemo(() => {
    let peak = 0;
    const raw = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const x = model.min + ((model.max - model.min) * i) / SAMPLES;
      const y = model.pdf(x);
      peak = Math.max(peak, y);
      raw.push({ px: xToPx(x), y });
    }
    return raw.map((p) => ({ px: p.px, yPx: peak > 0 ? baseline - (p.y / peak) * plotH : baseline }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const linePath = linePoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.yPx.toFixed(1)}`)
    .join(" ");
  const areaPath =
    `${linePath} L${linePoints[linePoints.length - 1].px.toFixed(1)},${baseline}` +
    ` L${linePoints[0].px.toFixed(1)},${baseline} Z`;

  const thresholdPx = xToPx(threshold);
  const oddsAbove = Math.round((1 - model.cdf(threshold)) * 100);

  return (
    <div className="outcome-curve">
      <div className="outcome-curve-label">Outcome odds</div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="outcome-curve-svg" role="img"
        aria-label={`Probability curve for ${label}, showing the odds of finishing above the dragged value`}>
        <defs>
          <linearGradient id={`below-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="grad-below-start" />
            <stop offset="100%" className="grad-below-end" />
          </linearGradient>
          <linearGradient id={`above-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="grad-above-start" />
            <stop offset="100%" className="grad-above-end" />
          </linearGradient>
          <clipPath id={`below-clip-${uid}`}>
            <rect x="0" y="0" width={Math.max(0, thresholdPx)} height={HEIGHT} />
          </clipPath>
          <clipPath id={`above-clip-${uid}`}>
            <rect x={thresholdPx} y="0" width={Math.max(0, WIDTH - thresholdPx)} height={HEIGHT} />
          </clipPath>
        </defs>

        <g clipPath={`url(#below-clip-${uid})`}>
          <path d={areaPath} fill={`url(#below-${uid})`} />
        </g>
        <g clipPath={`url(#above-clip-${uid})`}>
          <path d={areaPath} fill={`url(#above-${uid})`} />
        </g>

        <path d={linePath} className="curve-line" />
        <line x1={thresholdPx} x2={thresholdPx} y1={PAD_TOP} y2={baseline} className="curve-threshold" />

        {[floor, median, ceiling].map((x, i) => (
          <text
            key={i}
            x={Math.min(Math.max(xToPx(x), 10), WIDTH - 10)}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="curve-tick-label"
          >
            {Math.round(x)}
          </text>
        ))}
      </svg>

      <input
        type="range"
        className="outcome-curve-slider"
        min={model.min}
        max={model.max}
        step={1}
        value={Math.round(threshold)}
        onChange={(e) => setThreshold(Number(e.target.value))}
        aria-label={`Drag to see the odds ${label} finishes above a given value`}
      />

      <div className="outcome-curve-readout">
        <strong>{oddsAbove}%</strong> chance of {Math.round(threshold)}+ {label}
      </div>
    </div>
  );
}
