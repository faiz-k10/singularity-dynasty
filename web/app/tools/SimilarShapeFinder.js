"use client";

// Plain squared distance across whatever stat keys the two players share
// -- same metric PositionPercentile uses for its floor/median/ceiling
// comp finder, just applied to the full per-stat percentile vector
// instead of three season-total percentiles.
function shapeDistance(a, b, keys) {
  let sum = 0;
  for (const key of keys) {
    const d = (a[key] ?? 0) - (b[key] ?? 0);
    sum += d * d;
  }
  return sum;
}

// Ranks every peer that shares the same stat-key signature as the current
// player (built in page.js -- QBs pool with QBs, but WRs and TEs pool
// together since they carry the exact same 3 receiving keys) by how close
// their percentile shape is, and lets you toggle the closest ones onto
// the radar as a dashed overlay via onSelect.
export default function SimilarShapeFinder({ ownName, statPercentiles, keys, peers, selectedName, onSelect }) {
  if (!peers || peers.length === 0 || !keys || keys.length === 0) return null;

  const ranked = peers
    .filter((p) => p.name !== ownName)
    .map((p) => ({ ...p, dist: shapeDistance(statPercentiles, p.statPercentiles, keys) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);

  if (ranked.length === 0) return null;

  return (
    <div className="shape-finder">
      <div className="shape-finder-label mono">Most similar shape</div>
      <div className="shape-finder-list">
        {ranked.map((p) => {
          const isActive = selectedName === p.name;
          return (
            <button
              key={p.name}
              type="button"
              className={`shape-finder-item ${isActive ? "active" : ""}`}
              onClick={() => onSelect(isActive ? null : p.name)}
              aria-pressed={isActive}
            >
              <span>{p.name}</span>
              <span className="shape-finder-pos mono">{p.position}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
