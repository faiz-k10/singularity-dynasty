const SIZE = 280;
const CENTER = SIZE / 2;
const MAX_R = 85;
const RINGS = [0.25, 0.5, 0.75, 1];

// startDeg places vertex 0: -90 is straight up (the default point-up
// layout), 90 is straight down (used to flip WR/TE into a point-down
// triangle). Vertices then run clockwise from there.
function angleFor(i, n, startDeg) {
  return (Math.PI * 2 * i) / n + (startDeg * Math.PI) / 180;
}

function pointAt(i, n, frac, startDeg) {
  const a = angleFor(i, n, startDeg);
  return {
    x: CENTER + Math.cos(a) * MAX_R * frac,
    y: CENTER + Math.sin(a) * MAX_R * frac,
  };
}

// Keeps stat-name labels from clipping the viewBox edge regardless of
// which side of the circle they land on.
function labelAnchor(i, n, startDeg) {
  const c = Math.cos(angleFor(i, n, startDeg));
  if (c > 0.3) return "start";
  if (c < -0.3) return "end";
  return "middle";
}

function polygonPath(entries, n, frac, startDeg, pctileAt) {
  const pts = entries.map((entry, i) => pointAt(i, n, pctileAt ? pctileAt(entry) : frac, startDeg));
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
}

// Same percentile-vs-position math as the sliders above, one axis per
// stat instead of one slider for the season total -- so a big-play deep
// threat and a possession-chain WR with similar season totals show up as
// visibly different shapes instead of two similar-looking rows in the
// table. selectedKey highlights whichever stat is currently driving
// OutcomeCurve beside it, so clicking a stat row ties both visuals
// together instead of leaving the radar static.
export default function StatRadar({ entries, selectedKey, startDeg = -90 }) {
  if (!entries || entries.length < 3) return null;
  const n = entries.length;

  const shapePath = polygonPath(entries, n, null, startDeg, ([, , pctile]) => (pctile ?? 0) / 100);
  const shapePoints = entries.map(([, , pctile], i) => pointAt(i, n, (pctile ?? 0) / 100, startDeg));

  return (
    <div className="stat-radar">
      <div className="stat-radar-label">Percentile shape</div>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="stat-radar-svg"
        role="img"
        aria-label="Per-stat percentile shape versus position"
      >
        {RINGS.map((frac) => (
          <path key={frac} d={polygonPath(entries, n, frac, startDeg)} className="radar-ring" />
        ))}
        {entries.map((_, i) => {
          const outer = pointAt(i, n, 1, startDeg);
          return (
            <line key={i} x1={CENTER} y1={CENTER} x2={outer.x} y2={outer.y} className="radar-spoke" />
          );
        })}
        <path d={shapePath} className="radar-shape" />
        {shapePoints.map((p, i) => {
          const isActive = entries[i][0] === selectedKey;
          return (
            <circle
              key={entries[i][0]}
              cx={p.x}
              cy={p.y}
              r={isActive ? 4.5 : 3}
              className={isActive ? "radar-point radar-point-active" : "radar-point"}
            />
          );
        })}
        {entries.map(([key, label], i) => {
          const p = pointAt(i, n, 1.2, startDeg);
          const isActive = key === selectedKey;
          return (
            <text
              key={key}
              x={p.x}
              y={p.y}
              textAnchor={labelAnchor(i, n, startDeg)}
              dominantBaseline="middle"
              className={isActive ? "radar-axis-label radar-axis-label-active" : "radar-axis-label"}
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
