import OutcomeCurveDetail from "./OutcomeCurveDetail";
import { STAT_COLUMNS } from "./statColumns";

function ordinal(n) {
  const rounded = Math.round(n);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rounded}th`;
  switch (rounded % 10) {
    case 1: return `${rounded}st`;
    case 2: return `${rounded}nd`;
    case 3: return `${rounded}rd`;
    default: return `${rounded}th`;
  }
}

// Same break points/labels as PercentileCard.js's tier() (Player Season
// Simulations) -- kept as its own small copy rather than a shared import
// since the two pages' percentile shapes differ (one value+percentile
// per stat here, vs. floor/median/ceiling triples there); duplicating
// five lines is cheaper than threading a shared dependency between two
// otherwise-unrelated tool pages for this.
function tier(pctile) {
  if (pctile >= 90) return { label: "Elite", cls: "elite" };
  if (pctile >= 70) return { label: "Above Average", cls: "above" };
  if (pctile >= 40) return { label: "Average", cls: "avg" };
  if (pctile >= 15) return { label: "Below Average", cls: "below" };
  return { label: "Weak", cls: "weak" };
}

function formatValue(value) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

// One horizontal bar -- reuses the same .pctile-bar/.pctile-bar-fill/
// .pctile-bar-midtick classes Player Season Simulations' PercentileCard
// already styles globally, just with this page's own row shape (label +
// raw value + one percentile, not three).
function PctRow({ label, value, pctile }) {
  if (pctile == null) return null;
  const t = tier(pctile);
  return (
    <div className="weekly-pct-row">
      <span className="weekly-pct-label">{label}</span>
      <span className="weekly-pct-value">{formatValue(value)}</span>
      <div className="pctile-bar">
        <div className={`pctile-bar-fill pctile-bar-${t.cls}`} style={{ width: `${Math.max(pctile, 2)}%` }} />
        <div className="pctile-bar-midtick" />
        <span className="pctile-bar-midtick-label">50</span>
      </div>
      <span className="weekly-pct-ordinal">{ordinal(pctile)}</span>
    </div>
  );
}

// Row unfolded below a player on Weekly Projection Rankings -- same
// click-to-expand/collapse mechanic as Player Season Simulations'
// StatDetailRow (RankingsTable.js owns the open/close state and single-
// row-open-at-a-time behavior), but built for this page's own data shape:
// single-point weekly stats + one overall floor/median/ceiling, not a
// full per-stat floor/median/ceiling distribution. Shows the two things
// that data can actually say beyond what's already an inline column:
// (1) a bigger, fully-labeled version of the Curve cell, and (2) where
// this week's floor/projection/ceiling and each raw stat actually rank
// against the same-position pool -- the inline heat-tints only show
// relative color, never the real percentile number.
export default function WeeklyDetailRow({ row, colSpan, maxSpread }) {
  const pct = row.statPct || {};
  const statEntries = STAT_COLUMNS.filter((c) => row[c.key] != null && pct[c.key] != null);

  return (
    <tr className="stat-detail-row weekly-detail-row">
      <td colSpan={colSpan}>
        <div className="weekly-detail-grid">
          <div className="stat-panel weekly-detail-curve-panel">
            <OutcomeCurveDetail
              floor={row.floor}
              median={row.projection}
              ceiling={row.ceiling}
              maxSpread={maxSpread}
            />
            <p className="weekly-detail-caption">
              Peak position is relative to this player&apos;s own floor-ceiling range, not a shared
              axis -- it isn&apos;t comparable to another row&apos;s peak position, only to the printed
              median value above.
            </p>
          </div>
          <div className="stat-panel weekly-detail-pct-panel">
            <div className="weekly-pct-head">
              <span className="pctile-card-title">This week vs. the {row.position} pool</span>
            </div>
            <PctRow label="Floor" value={row.floor} pctile={pct.floor} />
            <PctRow label="Projection" value={row.projection} pctile={pct.projection} />
            <PctRow label="Ceiling" value={row.ceiling} pctile={pct.ceiling} />
            {statEntries.length > 0 && (
              <>
                <div className="weekly-pct-divider" />
                {statEntries.map((c) => (
                  <PctRow key={c.key} label={c.label} value={row[c.key]} pctile={pct[c.key]} />
                ))}
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
