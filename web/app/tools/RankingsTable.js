import Link from "next/link";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import ConfidenceBadge from "./ConfidenceBadge";

function formatProjection(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(1);
}

function PlayerCell({ row, withPopover }) {
  if (!withPopover) {
    return (
      <td>
        <ConfidenceBadge confidence={row.sample_confidence} /> {row.player_name}{" "}
        <TrendTag trend={row.trend} />
      </td>
    );
  }
  return (
    <td>
      <span className="player-hover" tabIndex={0}>
        <ConfidenceBadge confidence={row.sample_confidence} /> {row.player_name}
        <div className="player-popover">
          <div className="player-popover-card">
            <div className="player-popover-row">
              <span>Team</span>
              <span>{row.team || "—"}</span>
            </div>
            <div className="player-popover-row">
              <span>Proj</span>
              <span>{formatProjection(row.projection)}</span>
            </div>
            <div className="player-popover-row">
              <span>Trend</span>
              <span><TrendTag trend={row.trend} /></span>
            </div>
            {row.notes && <div className="player-popover-notes">{row.notes}</div>}
            <Link
              href={`/tools/compare-players?p1=${encodeURIComponent(row.player_name)}`}
              className="player-popover-compare"
            >
              + Compare
            </Link>
          </div>
        </div>
      </span>
    </td>
  );
}

export default function RankingsTable({
  rows,
  showPosition,
  showTeam = true,
  showProjection = false,
  showNotes = true,
  popoverOnName = false,
  sortKey,
  sortDir,
  currentParams,
  sortParam = "sort",
  dirParam = "dir",
}) {
  const sortProps = { activeSort: sortKey, activeDir: sortDir, currentParams, sortParam, dirParam };
  return (
    <div className="rankings-table-wrap">
      <table className="rankings-table">
        <thead>
          <tr>
            <SortableTh label="Rank" sortKey="rank" {...sortProps} />
            <SortableTh label="Player" sortKey="player_name" {...sortProps} />
            {showPosition && <SortableTh label="Pos" sortKey="position" {...sortProps} />}
            {showTeam && <SortableTh label="Team" sortKey="team" {...sortProps} />}
            {showProjection && (
              <SortableTh label="Proj" sortKey="projection" {...sortProps} />
            )}
            {showNotes && <th>Notes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.position}-${row.rank}`}>
              <td className="mono">{row.displayRank}</td>
              <PlayerCell row={row} withPopover={popoverOnName} />
              {showPosition && <td className="mono">{row.position}</td>}
              {showTeam && <td className="mono">{row.team || "—"}</td>}
              {showProjection && (
                <td className="mono">{formatProjection(row.projection)}</td>
              )}
              {showNotes && <td className="tool-notes">{row.notes || ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
