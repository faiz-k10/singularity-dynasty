import PositionBadge from "../tools/PositionBadge";

// Vertical exposure list, most-owned to least: how many of your saved
// teams roster each player. `rows` come from lib/portfolio.js buildPortfolio.
export default function ExposureSidebar({ rows, teamCount }) {
  const sorted = [...rows].sort(
    (a, b) =>
      b.teams - a.teams ||
      b.starterCount - a.starterCount ||
      (a.name || "").localeCompare(b.name || "")
  );
  return (
    <aside className="exposure-side glass-panel">
      <div className="exposure-side-head">
        <div className="portfolio-pulse-label">Player Exposure</div>
        <span className="portfolio-pulse-sub">{sorted.length} players · {teamCount} teams</span>
      </div>
      <ol className="exposure-side-list">
        {sorted.map((r, i) => (
          <li key={r.player_id} className="exposure-side-row">
            <span className="exposure-side-rank">{i + 1}</span>
            <span className="exposure-side-name">
              {r.name}
              <span className="exposure-side-bar"><span style={{ width: `${r.exposurePct}%` }} /></span>
            </span>
            <PositionBadge position={r.position} />
            <span className="exposure-side-pct">
              {r.teams}/{teamCount}
              <small>{Math.round(r.exposurePct)}%</small>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
