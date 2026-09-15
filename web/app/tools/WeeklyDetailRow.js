import OutcomeCurveDetail from "./OutcomeCurveDetail";

// Season-level usage/efficiency metrics, not weekly stats -- attached
// server-side in page.js's fetchSimsMetrics()/fetchSeasonXfp() (joined
// in from Player Season Simulations and player_game_log, two separate
// tables from this page's own redraft_rankings). Replaced the raw
// per-game stat columns (Rush Yds, Rec, ...) that used to sit here by
// request -- those are already visible as their own inline table
// columns; these four say more about WHY a player is projected where
// they are. wopr is null for QB (receiving usage only); targetShare/
// yacAboveExp are null for anyone but WR/TE; avgXfp is null until at
// least one game of this season has a published game log row.
const ADVANCED_METRICS = [
  { key: "wopr", label: "WOPR", format: (v) => v.toFixed(2) },
  { key: "targetShare", label: "Target Share", format: (v) => `${v.toFixed(1)}%` },
  { key: "yacAboveExp", label: "YAC Above Exp", format: (v) => v.toFixed(2) },
  { key: "avgXfp", label: "xFP/G (season)", format: (v) => v.toFixed(1) },
];

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
// raw value + one percentile, not three). `format` lets a caller override
// the generic integer/2-decimal default -- ADVANCED_METRICS' four rows
// each need their own real-world formatting (a percent sign on Target
// Share, fixed decimal places on WOPR/xFP) rather than one shared rule.
function PctRow({ label, value, pctile, format = formatValue }) {
  if (pctile == null) return null;
  const t = tier(pctile);
  return (
    <div className="weekly-pct-row">
      <span className="weekly-pct-label">{label}</span>
      <span className="weekly-pct-value">{value == null ? "—" : format(value)}</span>
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
// full per-stat floor/median/ceiling distribution. Shows two things
// beyond what's already an inline column: (1) a bigger, fully-labeled
// version of the Curve cell, and (2) where this week's floor/projection/
// ceiling AND four season-level usage metrics (ADVANCED_METRICS above)
// actually rank against the same-position pool -- the inline heat-tints
// only show relative color, never the real percentile number.
export default function WeeklyDetailRow({ row, colSpan, maxSpread }) {
  const pct = row.statPct || {};
  const advancedEntries = ADVANCED_METRICS.filter((m) => row[m.key] != null && pct[m.key] != null);

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
            {advancedEntries.length > 0 && (
              <>
                <div className="weekly-pct-divider" />
                {advancedEntries.map((m) => (
                  <PctRow key={m.key} label={m.label} value={row[m.key]} pctile={pct[m.key]} format={m.format} />
                ))}
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
