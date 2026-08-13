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
  keys,
  peers,
  selectedName,
  selectedLayer,
  onSelect,
}) {
  if (!peers || peers.length === 0 || !keys || keys.length === 0) return null;

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
            <div key={p.name} className={`shape-finder-item ${isActive ? "active" : ""}`}>
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
          );
        })}
      </div>
    </div>
  );
}
