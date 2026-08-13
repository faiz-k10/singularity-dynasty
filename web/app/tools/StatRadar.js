const SIZE = 280;
const CENTER = SIZE / 2;
// Labels wrap one word per line (see labelWords/LABEL_LINE_EM below), so
// the margin they need past the chart is roughly one word wide instead
// of a full two-word name -- except "Receptions", which has no space to
// break on and stays a single ~10-character run. That word lands on the
// near-horizontal vertex of the WR/TE triangle (RADAR_ORDER in
// PlayerSimSearch.js puts "receptions" at index 2, cos ~0.87 off
// startDeg=90), which is the actual binding constraint on MAX_R *
// LABEL_FRAC -- go past ~96 viewBox units of label radius there and
// "Receptions" clips the right edge of the viewBox.
//
// The gap that matters for readability isn't ring-to-label, it's
// point-to-label: a vertex's dot sits at its own percentile, up to
// MAX_R for a ~100th-percentile stat, i.e. right at the ring. A two-
// line label's first word also shifts back toward the point by half a
// line (LABEL_LINE_EM/2) to stay vertically centered on labelPos, so
// the true clearance is smaller than LABEL_FRAC alone suggests -- a
// too-small gap read as the label sitting on top of the point/ring
// (see "Rec"/"TDs" screenshot). MAX_R/LABEL_FRAC below put ~16 viewBox
// units of radius between the ring and the label anchor (vs. the
// original ~4), while staying under the ~96-unit Receptions ceiling.
const MAX_R = 70;
const LABEL_FRAC = 1.23;
const LABEL_LINE_EM = 1.05;
const RINGS = [0.25, 0.5, 0.75, 1];

// One word per line so "Pass Yards" reads as "Pass" / "Yards" instead of
// needing full-string-width margin on the horizontal vertices.
function labelWords(label) {
  return label.split(" ");
}

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
// ceiling spread visibly bulges out on that axis.
// compareEntries is an optional second shape, [key, label, pctile]
// tuples (median only, no band) in the same order/positions as entries
// (see SimilarShapeFinder), drawn as a dashed overlay so a comp's shape
// can be held up against the player's own without leaving the row.
// onSelectKey (optional) makes each vertex itself clickable -- mirrors
// the stat table's own row trigger (clicking a stat name), so selection
// can be driven from either visual and both stay in sync via the shared
// selection state one level up in StatDetailRow.
//
// selection is one of three shapes (or null): {mode:"row", key} shows
// all three floor/median/ceiling markers on that one vertex, evenly
// weighted, mirroring "clicked this stat's name". {mode:"column",
// layer} shows that one layer's marker on *every* vertex plus bolds its
// band/shape outline, mirroring "clicked the Floor/Median/Ceiling
// header" -- floor/ceiling markers are otherwise hidden entirely, so
// this is what makes them visible across the whole chart at once.
// {mode:"cell", key, layer} shows just the one marker at that exact
// vertex+layer, nothing else -- mirrors clicking one specific number in
// the table. Each mode fully replaces the last (see StatDetailRow), so
// there's never a mix of a stale row and a fresh column both lit up.
export default function StatRadar({ entries, selection = null, startDeg = -90, compareEntries, onSelectKey }) {
  if (!entries || entries.length < 3) return null;
  const n = entries.length;
  const columnLayer = selection?.mode === "column" ? selection.layer : null;

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
            className={columnLayer === "floor" ? "radar-band-outline radar-band-outline-active" : "radar-band-outline"}
          />
        )}
        {ceilingOutline && (
          <path
            d={ceilingOutline}
            className={columnLayer === "ceiling" ? "radar-band-outline radar-band-outline-active" : "radar-band-outline"}
          />
        )}
        {comparePath && <path d={comparePath} className="radar-shape-compare" />}
        <path
          d={shapePath}
          className={columnLayer === "median" ? "radar-shape radar-shape-active" : "radar-shape"}
        />
        {entries.map(([key, label], i) => {
          const point = shapePoints[i];
          const labelPos = pointAt(i, n, LABEL_FRAC, startDeg);
          const isRowSel = selection?.mode === "row" && selection.key === key;
          const cellLayer = selection?.mode === "cell" && selection.key === key ? selection.layer : null;
          const isActive = isRowSel || cellLayer !== null;
          const isMedianActive = cellLayer === "median" || columnLayer === "median";
          // 4.5 for the one exact cell selected, 4 for a whole-column
          // selection (every vertex gets this), 3.5 for a whole-row
          // selection (this vertex's other two markers), 0 otherwise --
          // median's dot follows the exact same on-only-when-selected rule
          // as floor/ceiling now (it used to stay visible at r=3 as a
          // permanent baseline, which read as "always selected" even when
          // nothing was). The connecting shapePath line below is what
          // stays permanently visible -- that's the actual chart, not a
          // selection marker.
          const floorR = cellLayer === "floor" ? 4.5 : columnLayer === "floor" ? 4 : isRowSel ? 3.5 : 0;
          const ceilingR = cellLayer === "ceiling" ? 4.5 : columnLayer === "ceiling" ? 4 : isRowSel ? 3.5 : 0;
          const medianR = cellLayer === "median" ? 4.5 : columnLayer === "median" ? 4 : isRowSel ? 3.5 : 0;
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
              {floorPoints && <circle cx={floorPoints[i].x} cy={floorPoints[i].y} r={floorR} className="radar-point-floor" />}
              {ceilingPoints && (
                <circle cx={ceilingPoints[i].x} cy={ceilingPoints[i].y} r={ceilingR} className="radar-point-ceiling" />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={medianR}
                className={isMedianActive ? "radar-point radar-point-active" : "radar-point"}
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor={labelAnchor(i, n, startDeg)}
                dominantBaseline="middle"
                className={isActive ? "radar-axis-label radar-axis-label-active" : "radar-axis-label"}
              >
                {labelWords(label).map((word, wi, words) => (
                  <tspan
                    key={wi}
                    x={labelPos.x}
                    dy={wi === 0 ? `${-(words.length - 1) * (LABEL_LINE_EM / 2)}em` : `${LABEL_LINE_EM}em`}
                  >
                    {word}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
