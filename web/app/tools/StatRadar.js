const SIZE = 280;
const CENTER = SIZE / 2;
// The square 280x280 viewBox has real, measured-not-guessed blank space
// above and below its content, split unevenly between top/bottom
// depending on orientation -- a point-up pentagon (startDeg -90, QB/RB)
// needs more clearance ABOVE center for its single top vertex/label than
// below (two lower vertices sit at only ~0.81*MAX_R from center, vs the
// top vertex's full MAX_R); a point-down triangle (startDeg 90, WR/TE)
// is the mirror image. Raw (uncropped) blank was measured at -90: 46.5
// above / 60.2 below; at 90: 53.0 above / 43.8 below. The four CROP_*
// constants below first equalize each orientation's top/bottom margin
// (leaving a couple of units of the smaller side's own spare as a
// safety buffer against font-rendering variance), then trim a further
// ~25% off both sides evenly (explicit ask: "cut the bottom margin ...
// by 25% and do the same for the top margin") -- e.g. -90's ~46.5/~48.2
// post-equalize margins each shrink to ~35.5/~35.2. Width stays
// untouched (280 the whole way) -- that dimension is sized for
// "Receptions" clipping the horizontal vertex, unrelated to this
// top/bottom crop.
const CROP_TOP_UP = 11; // startDeg -90 (QB/RB): 46.5 -> ~35.5
const CROP_BOTTOM_UP = 25; // startDeg -90 (QB/RB): 60.2 -> ~35.2
const CROP_TOP_DOWN = 19; // startDeg 90 (WR/TE): 53.0 -> ~34.0
const CROP_BOTTOM_DOWN = 10; // startDeg 90 (WR/TE): 43.8 -> ~33.8
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
// tight (the opened-row panel on Player Season Simulations): crop the viewBox to the chart's real content (measured
// with getBBox, plus a few units of padding) instead of the roomier square used elsewhere, so the same panel width
// draws the chart ~15-20% larger and nothing is left as dead space around it.
const TIGHT_VIEWBOX = { up: [18, 42, 244, 186], down: [18, 58, 244, 185] }; // x is symmetric about the polygon's centre (140), so the chart sits in the middle of its panel

export default function StatRadar({ entries, selection = null, startDeg = -90, compareEntries, onSelectKey, tight = false, pool }) {
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
  const floorOutline = hasBand ? polygonPath(entries, n, null, startDeg, floorAt) : null;
  const ceilingOutline = hasBand ? polygonPath(entries, n, null, startDeg, ceilingAt) : null;
  const comparePath = compareEntries
    ? polygonPath(compareEntries, n, null, startDeg, ([, , pctile]) => (pctile ?? 0) / 100)
    : null;
  // See the CROP_* comment above for where these numbers come from.
  const [cropTop, cropBottom] = startDeg === 90 ? [CROP_TOP_DOWN, CROP_BOTTOM_DOWN] : [CROP_TOP_UP, CROP_BOTTOM_UP];
  const viewBox = tight ? TIGHT_VIEWBOX[startDeg === 90 ? "down" : "up"].join(" ") : `0 ${cropTop} ${SIZE} ${SIZE - cropTop - cropBottom}`;

  return (
    <div className="stat-radar">
      <div className="weekly-panel-title stat-radar-title">Percentile Shape</div>
      {pool && <div className="stat-radar-sub">vs. {pool} pool</div>}
      <svg
        viewBox={viewBox}
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
        {/* three nested fills, one per layer (founder, Nov 10 2026): the ceiling's reach in blue, the median's in ink, the floor's in red -- each subtle, together readable at a glance */}
        {ceilingOutline && <path d={ceilingOutline} className="radar-fill radar-fill-ceiling" />}
        <path d={shapePath} className="radar-fill radar-fill-median" />
        {floorOutline && <path d={floorOutline} className="radar-fill radar-fill-floor" />}
        {floorOutline && (
          <path
            d={floorOutline}
            className={
              columnLayer === "floor"
                ? "radar-band-outline radar-outline-floor radar-band-outline-active"
                : columnLayer
                ? "radar-band-outline radar-outline-floor radar-band-outline-dim"
                : "radar-band-outline radar-outline-floor"
            }
          />
        )}
        {ceilingOutline && (
          <path
            d={ceilingOutline}
            className={
              columnLayer === "ceiling"
                ? "radar-band-outline radar-outline-ceiling radar-band-outline-active"
                : columnLayer
                ? "radar-band-outline radar-outline-ceiling radar-band-outline-dim"
                : "radar-band-outline radar-outline-ceiling"
            }
          />
        )}
        {comparePath && <path d={comparePath} className="radar-shape-compare" />}
        <path
          d={shapePath}
          className={
            columnLayer === "median"
              ? "radar-shape radar-shape-active"
              : columnLayer
              ? "radar-shape radar-shape-dim"
              : "radar-shape"
          }
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
          // With a similar player overlaid, each stat NAME is coloured: blue = this player is above the comp, ember = below, plain = level (median percentile). No extra glyphs, so the labels keep their shape.
          const mine = entries[i][2];
          const theirs = compareEntries?.[i]?.[2];
          const cmpMark =
            compareEntries && mine != null && theirs != null && Math.round(mine) !== Math.round(theirs)
              ? mine > theirs
                ? "radar-cmp-up"
                : "radar-cmp-down"
              : compareEntries
              ? "radar-cmp-even"
              : "";
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
                className={`${isActive ? "radar-axis-label radar-axis-label-active" : "radar-axis-label"} ${cmpMark}`}
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
      {compareEntries && (
        <div className="radar-cmp-legend" aria-hidden="true">
          <span className="radar-cmp-key radar-cmp-up">above</span>
          <span className="radar-cmp-key radar-cmp-down">below</span>
          <span className="radar-cmp-note">the similar player, by stat</span>
        </div>
      )}
    </div>
  );
}
