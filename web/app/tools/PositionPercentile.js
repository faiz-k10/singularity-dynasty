// Marker-on-a-bar row for one stat's percentile rank vs. position --
// pctile is 0-100, already computed server-side in page.js (share of the
// position pool this player's number beats).
function PctileBar({ label, pctile }) {
  return (
    <div className="pctile-row">
      <span className="pctile-label">{label}</span>
      <div className="pctile-track">
        <div className="pctile-fill" style={{ width: `${pctile}%` }}></div>
        <div className="pctile-marker" style={{ left: `${pctile}%` }}></div>
      </div>
      <span className="pctile-value mono">{ordinal(pctile)}</span>
    </div>
  );
}

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

// Only renders with full access -- see page.js for why the teaser pool
// isn't a fair sample to rank against.
export default function PositionPercentile({
  position,
  poolSize,
  floorPctile,
  medianPctile,
  ceilingPctile,
}) {
  if (floorPctile == null || medianPctile == null || ceilingPctile == null) {
    return null;
  }
  return (
    <div className="position-percentile">
      <div className="position-percentile-head mono">
        VS {poolSize} {position}
        {poolSize === 1 ? "" : "S"} · PERCENTILE RANK
      </div>
      <PctileBar label="Floor" pctile={floorPctile} />
      <PctileBar label="Median" pctile={medianPctile} />
      <PctileBar label="Ceiling" pctile={ceilingPctile} />
    </div>
  );
}
