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

// Two polygon subpaths in one <path fill-rule="evenodd">, so the ring
// between them (outer minus inner) fills as a band instead of a solid
// shape -- used to shade the floor-to-ceiling spread around the median.
function bandPath(entries, n, startDeg, outerAt, innerAt) {
  return (
    polygonPath(entries, n, null, startDeg, outerAt) + " " + polygonPath(entries, n, null, startDeg, innerAt)
  );
}

// Percentile-vs-position math, one axis per stat -- so a big-play deep
// threat and a possession-chain WR with similar season totals show up as
// visibly different shapes instead of two similar-looking rows in the
// table. entries are [key, label, medianPctile, floorPctile,
// ceilingPctile] tuples -- the median draws as the solid shape, floor/
// ceiling as a shaded band around it so a stat with a wide floor-to-
// ceiling spread visibly bulges out on that axis. selectedKey highlights
// whichever stat row was last clicked in the table beside it, so the two
// visuals stay tied together instead of the radar being static.
// compareEntries is an optional second shape, [key, label, pctile]
// tuples (median only, no band) in the same order/positions as entries
// (see SimilarShapeFinder), drawn as a dashed overlay so a comp's shape
// can be held up against the player's own without leaving the row.
// onSelectKey (optional) makes each vertex itself clickable -- mirrors
// the stat table's own row trigger, so selection can be driven from
// either visual and both stay in sync via the shared selectedKey state
// one level up in StatDetailRow. selectedLayer ("floor"/"median"/
// "ceiling") points at which specific number is active -- e.g. clicking
// the Floor cell for a stat lights up that stat's floor marker and
// thickens the floor band outline, instead of only ever emphasizing the
// median point regardless of which column was clicked.
export default function StatRadar({ entries, selectedKey, startDeg = -90, compareEntries, onSelectKey, selectedLayer = "median" }) {
  if (!entries || entries.length < 3) return null;
  const n = entries.length;

  const shapePath = polygonPath(entries, n, null, startDeg, ([, , pctile]) => (pctile ?? 0) / 100);
  const shapePoints = entries.map(([, , pctile], i) => pointAt(i, n, (pctile ?? 0) / 100, startDeg));
  const hasBand = entries.some(([, , , floorPctile, ceilingPctile]) => floorPctile != null || ceilingPctile != null);
  const floorAt = ([, , medianPctile, floorPctile]) => (floorPctile ?? medianPctile ?? 0) / 100;
  const ceilingAt = ([, , medianPctile, , ceilingPctile]) => (ceilingPctile ?? medianPctile ?? 0) / 100;
  const floorPoints = hasBand ? entries.map((entry, i) => pointAt(i, n, floorAt(entry), startDeg)) : null;
  const ceilingPoints = hasBand ? entries.map((entry, i) => pointAt(i, n, ceilingAt(entry), startDeg)) : null;
  const bandFillPath = hasBand ? bandPath(entries, n, startDeg, ceilingAt, floorAt) : null;
  const floorOutline = hasBand ? polygonPath(entries, n, null, startDeg, floorAt) : null;
  const ceilingOutline = hasBand ? polygonPath(entries, n, null, startDeg, ceilingAt) : null;
  const comparePath = compareEntries
    ? polygonPath(compareEntries, n, null, startDeg, ([, , pctile]) => (pctile ?? 0) / 100)
    : null;

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
        {bandFillPath && <path d={bandFillPath} fillRule="evenodd" className="radar-band" />}
        {floorOutline && (
          <path
            d={floorOutline}
            className={selectedLayer === "floor" ? "radar-band-outline radar-band-outline-active" : "radar-band-outline"}
          />
        )}
        {ceilingOutline && (
          <path
            d={ceilingOutline}
            className={selectedLayer === "ceiling" ? "radar-band-outline radar-band-outline-active" : "radar-band-outline"}
          />
        )}
        {comparePath && <path d={comparePath} className="radar-shape-compare" />}
        <path
          d={shapePath}
          className={selectedLayer === "median" ? "radar-shape radar-shape-active" : "radar-shape"}
        />
        {entries.map(([key, label], i) => {
          const point = shapePoints[i];
          const labelPos = pointAt(i, n, 1.2, startDeg);
          const isActive = key === selectedKey;
          const isMedianActive = isActive && selectedLayer === "median";
          const isFloorActive = isActive && selectedLayer === "floor";
          const isCeilingActive = isActive && selectedLayer === "ceiling";
          const select = () => onSelectKey?.(key);
          return (
            <g
              key={key}
              className={onSelectKey ? "radar-vertex" : undefined}
              onClick={onSelectKey ? select : undefined}
              role={onSelectKey ? "button" : undefined}
              tabIndex={onSelectKey ? 0 : undefined}
              aria-pressed={onSelectKey ? isActive : undefined}
              aria-label={onSelectKey ? label : undefined}
              onKeyDown={
                onSelectKey
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select();
                      }
                    }
                  : undefined
              }
            >
              {onSelectKey && <circle cx={point.x} cy={point.y} r={14} className="radar-vertex-hit" />}
              {floorPoints && (
                <circle
                  cx={floorPoints[i].x}
                  cy={floorPoints[i].y}
                  r={isFloorActive ? 4.5 : 0}
                  className="radar-point-floor"
                />
              )}
              {ceilingPoints && (
                <circle
                  cx={ceilingPoints[i].x}
                  cy={ceilingPoints[i].y}
                  r={isCeilingActive ? 4.5 : 0}
                  className="radar-point-ceiling"
                />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={isMedianActive ? 4.5 : 3}
                className={isMedianActive ? "radar-point radar-point-active" : "radar-point"}
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor={labelAnchor(i, n, startDeg)}
                dominantBaseline="middle"
                className={isActive ? "radar-axis-label radar-axis-label-active" : "radar-axis-label"}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
