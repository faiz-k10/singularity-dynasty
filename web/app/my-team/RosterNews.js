"use client";

function ago(iso) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

// Injury & news feed for everyone rostered across the saved teams, newest
// news first (order set in getRosterNews()).
export default function RosterNews({ news, onlyStarters = false, onlyInjuries = false }) {
  if (!news) return null;
  if (news.unavailable) {
    return (
      <div className="roster-news glass-panel">
        <p className="league-dash-muted">The injury feed is temporarily unavailable.</p>
      </div>
    );
  }
  const items = (news.items || []).filter(
    (i) => (!onlyStarters || i.starts.length) && (!onlyInjuries || i.severity > 0)
  );
  return (
    <div className="roster-news glass-panel">
      {items.length === 0 ? (
        <p className="league-dash-muted">Nothing new on your rosters.</p>
      ) : (
        <ul className="roster-news-list">
          {items.map((i) => (
            <li key={`${i.norm}|${i.position}`} className="roster-news-item">
              <div className="roster-news-head">
                <span className={`status-dot status-dot-${i.severity}`} aria-label={i.status} />
                <strong>{i.name}</strong>
                <span className="league-dash-muted">{i.position}{i.team ? ` · ${i.team}` : ""}</span>
                {i.severity > 0 && <span className={`status-text status-text-${i.severity}`}>{i.status}</span>}
                {i.detail && i.severity > 0 && <span className="league-dash-muted">{i.detail}</span>}
                <span className="league-dash-muted roster-news-time">{ago(i.date)}</span>
              </div>
              {i.comment && <p className="roster-news-comment">{i.comment}</p>}
              <div className="league-dash-muted">
                {i.starts.length > 0 ? `Starting in ${i.starts.length}: ${i.starts.join(", ")}` : "Bench"}
                {i.rosters.length > i.starts.length && i.starts.length > 0 ? ` · rostered in ${i.rosters.length}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
