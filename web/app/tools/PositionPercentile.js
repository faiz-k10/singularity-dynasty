"use client";

import { useMemo, useState } from "react";

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// One draggable 0-100 percentile row. Native range input styled to match
// .outcome-curve-slider (track + gold thumb, no fill gradient -- same
// minimal treatment used everywhere else in this codebase for a slider).
function PctileSlider({ label, value, onChange }) {
  return (
    <div className="pctile-row">
      <span className="pctile-label">{label}</span>
      <input
        type="range"
        className="pctile-slider"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} percentile`}
      />
      <span className="pctile-value mono">{ordinal(value)}</span>
    </div>
  );
}

// Three percentile sliders that move as one unit -- dragging any of them
// shifts all three by the same delta, so the gaps between floor/median/
// ceiling (how much safer the floor is than the ceiling, etc.) stay fixed
// while the whole group slides along the 0-100 range. They search the same
// position pool from page.js for whichever player's own three percentiles
// land closest to the shifted values, by plain squared distance across all
// three dimensions equally weighted. Only renders with a percentile profile
// in the first place -- see page.js for when that's null (position pool of 1).
export default function PositionPercentile({
  playerName,
  position,
  poolSize,
  floorPctile,
  medianPctile,
  ceilingPctile,
  peers,
}) {
  const [offset, setOffset] = useState(0);

  // Bounds on the shared offset so the whole group stays within 0-100
  // without needing to clamp each slider (and thus distort) individually.
  const offsetMin = -Math.min(floorPctile, medianPctile, ceilingPctile);
  const offsetMax = 100 - Math.max(floorPctile, medianPctile, ceilingPctile);

  const floor = floorPctile + offset;
  const median = medianPctile + offset;
  const ceiling = ceilingPctile + offset;

  function handleDrag(basePctile, newValue) {
    const clamped = Math.min(offsetMax, Math.max(offsetMin, newValue - basePctile));
    setOffset(clamped);
  }

  const bestFit = useMemo(() => {
    if (!peers || peers.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (const p of peers) {
      const dFloor = p.floorPctile - floor;
      const dMedian = p.medianPctile - median;
      const dCeiling = p.ceilingPctile - ceiling;
      const dist = dFloor * dFloor + dMedian * dMedian + dCeiling * dCeiling;
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    return best;
  }, [peers, floor, median, ceiling]);

  if (floorPctile == null || medianPctile == null || ceilingPctile == null) {
    return null;
  }

  const isOwnProfile = offset === 0;

  return (
    <div className="position-percentile">
      <div className="position-percentile-head mono">
        VS {poolSize} {position}
        {poolSize === 1 ? "" : "S"} · DRAG TO FIND A COMP
      </div>
      <PctileSlider label="Floor" value={floor} onChange={(v) => handleDrag(floorPctile, v)} />
      <PctileSlider label="Median" value={median} onChange={(v) => handleDrag(medianPctile, v)} />
      <PctileSlider label="Ceiling" value={ceiling} onChange={(v) => handleDrag(ceilingPctile, v)} />
      {bestFit && (
        <div className="pctile-match mono">
          {isOwnProfile ? (
            <>THIS IS <strong>{playerName}</strong></>
          ) : (
            <>
              CLOSEST COMP: <strong>{bestFit.name}</strong>{" "}
              ({ordinal(bestFit.floorPctile)} / {ordinal(bestFit.medianPctile)} / {ordinal(bestFit.ceilingPctile)})
            </>
          )}
        </div>
      )}
    </div>
  );
}
