import { computeProjectionBreakdown } from "@/lib/scoring";

function formatRaw(key, value) {
  if (key === "receptions") return value.toFixed(1);
  if (key.endsWith("_yards")) return value.toFixed(1);
  return value.toFixed(2);
}

// Redraft's per-player "what's this projection built from" row. Rendered
// inside RankingsTable's expandable stat-detail-row for a clicked player.
// Deliberately does NOT reconcile its subtotal to the row's displayed
// PROJ -- see computeProjectionBreakdown's comment in lib/scoring.js for
// why that gap is structural (median-of-real-weeks vs sum-of-mean-
// components), not a bug to paper over.
export default function RedraftStatBreakdown({ row, settings }) {
  const { entries, subtotal } = computeProjectionBreakdown(row.scoring_stats, row.position, settings);

  if (entries.length === 0) {
    return <p className="stat-breakdown-empty">No component stats published for this player yet.</p>;
  }

  return (
    <div className="stat-breakdown">
      <table className="stat-detail-table stat-breakdown-table">
        <thead>
          <tr>
            <th>Stat (weekly avg)</th>
            <th>Value</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.key}>
              <td>{e.label}</td>
              <td className="mono">{formatRaw(e.key, e.rawValue)}</td>
              <td className="mono">{e.points >= 0 ? "+" : ""}{e.points.toFixed(1)}</td>
            </tr>
          ))}
          <tr className="stat-breakdown-subtotal">
            <td>Component subtotal</td>
            <td></td>
            <td className="mono">{subtotal.toFixed(1)}</td>
          </tr>
        </tbody>
      </table>
      <p className="stat-breakdown-note">
        This subtotal is the sum of the weighted-average stats above and won&apos;t exactly
        match the <strong>Proj</strong> column — that number is the model&apos;s weighted
        median of this player&apos;s real weekly point totals, a different (more outlier-
        resistant) statistic than a sum of averaged components.
      </p>
    </div>
  );
}
