"use client";

// Plain squared distance across whatever stat keys the two players share.
function shapeDistance(a, b, keys) {
  let sum = 0;
  for (const key of keys) {
    const d = (a[key] ?? 0) - (b[key] ?? 0);
    sum += d * d;
  }
  return sum;
}

const LAYERS = [
  { key: "floor", label: "F", name: "floor" },
  { key: "median", label: "M", name: "median" },
  { key: "ceiling", label: "C", name: "ceiling" },
];
const LAYER_LABEL = { floor: "Floor", median: "Median", ceiling: "Ceiling" };

// One row of the diverging bar: two ticks (this player's percentile and
// the comp's) on a shared 0-100 track, with the span between them filled
// green when the player leads and red when the comp does -- the same
// --up/--down pair TrendTag/the ticker already use, so "ahead" reads the
// same color language site-wide instead of introducing a new green/red.
// The +/-N number is the same comparison spelled out as a plain number
// for whoever doesn't want to read bar positions.
function CompareBar({ label, playerPctile, compPctile }) {
  if (playerPctile == null || compPctile == null) return null;
  const diff = Math.round(playerPctile) - Math.round(compPctile);
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "even";
  const lo = Math.min(playerPctile, compPctile);
  const hi = Math.max(playerPctile, compPctile);
  return (
    <div className="shape-compare-row">
      <span className="shape-compare-row-label">{label}</span>
      <div className="shape-compare-track">
        <div className={`shape-compare-fill shape-compare-fill-${dir}`} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        <div className="shape-compare-tick shape-compare-tick-comp" style={{ left: `${compPctile}%` }} />
        <div className="shape-compare-tick shape-compare-tick-player" style={{ left: `${playerPctile}%` }} />
      </div>
      <span className={`shape-compare-diff shape-compare-diff-${dir}`}>
        {diff > 0 ? `+${diff}` : diff === 0 ? "±0" : diff}
      </span>
    </div>
  );
}

// Renders the CompareBar row(s) relevant to whatever's selected in the
// stat table/radar above (see StatDetailRow's `selection`): one bar per
// Floor/Median/Ceiling for a selected stat (row mode), one bar for a
// selected stat+layer (cell mode), or nothing for a whole-column
// selection or no selection at all, since neither pins one stat to
// compare against.
function CompareBars({ selection, stats, player, peer }) {
  if (!selection || selection.mode === "column") return null;
  const stat = stats.find((s) => s.key === selection.key);
  if (!stat) return null;
  const playerByLayer = { floor: player.floorPctile, median: player.medianPctile, ceiling: player.ceilingPctile };
  const compByLayer = {
    floor: peer.statFloorPercentiles?.[selection.key],
    median: peer.statPercentiles?.[selection.key],
    ceiling: peer.statCeilingPercentiles?.[selection.key],
  };
  const layers = selection.mode === "cell" ? [selection.layer] : ["floor", "median", "ceiling"];
  return (
    <div className="shape-compare">
      <div className="shape-compare-head">{stat.label} vs. player</div>
      {layers.map((layer) => (
        <CompareBar key={layer} label={LAYER_LABEL[layer]} playerPctile={playerByLayer[layer]} compPctile={compByLayer[layer]} />
      ))}
    </div>
  );
}

// Ranks every peer that shares the same stat-key signature as the current
// player (built in page.js -- QBs pool with QBs, but WRs and TEs pool
// together since they carry the exact same 3 receiving keys) by how close
// their percentile shape is, and lets you toggle the closest ones onto the
// radar as a dashed overlay via onSelect(name, layer). Each row carries its
// own Floor/Median/Ceiling picker (mirrors the main table's header trigger)
// so the comp can be held up against any one of your own three views, not
// just its median -- selectedLayer is which one is currently showing for
// whichever peer is active.
export default function SimilarShapeFinder({
  ownName,
  statPercentiles,
  statFloorPercentiles,
  statCeilingPercentiles,
  stats,
  keys,
  peers,
  selectedName,
  selectedLayer,
  onSelect,
  selection,
}) {
  if (!peers || peers.length === 0 || !keys || keys.length === 0) return null;
  // The player's own three percentiles for whatever stat is selected --
  // computed once here (doesn't vary per comp) and handed to every
  // CompareBars below alongside that comp's own peer object.
  const playerPctiles = selection?.key
    ? {
        floorPctile: statFloorPercentiles?.[selection.key],
        medianPctile: statPercentiles?.[selection.key],
        ceilingPctile: statCeilingPercentiles?.[selection.key],
      }
    : null;

  const ranked = peers
    .filter((p) => p.name !== ownName)
    .map((p) => ({ ...p, dist: shapeDistance(statPercentiles, p.statPercentiles, keys) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);

  if (ranked.length === 0) return null;

  return (
    <div className="shape-finder stat-panel stat-panel-finder">
      <div className="shape-finder-label mono">Most similar shape</div>
      <div className="shape-finder-list">
        {ranked.map((p) => {
          const isActive = selectedName === p.name;
          return (
            <div key={p.name} className="shape-finder-entry">
              <div className={`shape-finder-item ${isActive ? "active" : ""}`}>
                <button
                  type="button"
                  className="shape-finder-name"
                  onClick={() => onSelect(p.name, "median")}
                  aria-pressed={isActive}
                >
                  <span>{p.name}</span>
                  <span className="shape-finder-pos mono">{p.position}</span>
                </button>
                <div className="shape-finder-layers mono" role="group" aria-label={`${p.name} comparison view`}>
                  {LAYERS.map((layer) => {
                    const layerActive = isActive && selectedLayer === layer.key;
                    return (
                      <button
                        key={layer.key}
                        type="button"
                        className={`shape-finder-layer-btn ${layerActive ? "active" : ""}`}
                        onClick={() => onSelect(p.name, layer.key)}
                        aria-pressed={layerActive}
                        aria-label={`Compare ${p.name}'s ${layer.name}`}
                      >
                        {layer.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {playerPctiles && stats && (
                <CompareBars selection={selection} stats={stats} player={playerPctiles} peer={p} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
