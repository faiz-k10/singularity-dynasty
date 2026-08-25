import Link from "next/link";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import ConfidenceBadge from "./ConfidenceBadge";
import TeamBadge from "./TeamBadge";
import { matchupTint } from "./MatchupBadge";

function formatProjection(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(1);
}

// The raw weekly-average component stats that feed a player's custom-
// scoring projection (see lib/scoring.js) -- shown as their own columns
// (Redraft only, via showStatColumns) rather than tucked behind a click,
// so they're visible right in the table. Not every column applies to
// every position (a WR has no passing_yards) -- STAT_COLUMNS just reads
// whatever's in scoring_stats and renders "—" for a column a given
// player's position doesn't publish.
const STAT_COLUMNS = [
  { key: "passing_yards", label: "Pass Yds" },
  { key: "passing_tds", label: "Pass TD" },
  { key: "passing_interceptions", label: "INT" },
  { key: "rushing_yards", label: "Rush Yds" },
  { key: "rushing_tds", label: "Rush TD" },
  { key: "receptions", label: "Rec" },
  { key: "receiving_yards", label: "Rec Yds" },
  { key: "receiving_tds", label: "Rec TD" },
];

function formatStat(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(1);
}

function PlayerCell({ row, withPopover }) {
  if (!withPopover) {
    return (
      <td className="player-cell">
        <TrendTag trend={row.trend} /> {row.player_name}{" "}
        <ConfidenceBadge confidence={row.sample_confidence} />
      </td>
    );
  }
  return (
    <td className="player-cell">
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
  showOpponent = false,
  showProjection = false,
  showNotes = true,
  showStatColumns = false,
  popoverOnName = false,
  sortKey,
  sortDir,
  currentParams,
  sortParam = "sort",
  dirParam = "dir",
  tableClassName = "",
}) {
  const sortProps = { activeSort: sortKey, activeDir: sortDir, currentParams, sortParam, dirParam };
  return (
    <div className={`rankings-table-wrap${tableClassName ? ` ${tableClassName}-wrap` : ""}`}>
      <table className={`rankings-table${tableClassName ? ` ${tableClassName}` : ""}`}>
        <thead>
          <tr>
            <SortableTh label="Rank" sortKey="rank" {...sortProps} />
            <SortableTh label="Player" sortKey="player_name" {...sortProps} />
            {showPosition && <SortableTh label="Pos" sortKey="position" {...sortProps} />}
            {showTeam && <SortableTh label="Team" sortKey="team" {...sortProps} />}
            {showOpponent && <SortableTh label="Opp" sortKey="opponent" {...sortProps} />}
            {showProjection && (
              <SortableTh label="Proj" sortKey="projection" {...sortProps} />
            )}
            {showStatColumns &&
              STAT_COLUMNS.map((c) => <SortableTh key={c.key} label={c.label} sortKey={c.key} {...sortProps} />)}
            {showNotes && <SortableTh label="Notes" sortKey="notes" {...sortProps} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.position}-${row.rank}`} data-pos={row.position}>
              <td className="mono">{row.displayRank}</td>
              <PlayerCell row={row} withPopover={popoverOnName} />
              {showPosition && (
                <td className="mono align-left">
                  {row.position}
                  {row.positionLabel && row.positionLabel !== row.position && (
                    <span className="pos-rank">{row.positionLabel.slice(row.position.length)}</span>
                  )}
                </td>
              )}
              {showTeam && (
                <td className="mono align-left">
                  <TeamBadge team={row.team} />
                </td>
              )}
              {showOpponent && (() => {
                const tint = matchupTint(row.matchup_mult);
                return (
                  <td
                    className={`mono${tint ? ` matchup-cell ${tint.cls}` : ""}`}
                    style={tint ? { "--heat": tint.heat } : undefined}
                    title={tint ? tint.label : undefined}
                  >
                    {row.opponent || "—"}
                  </td>
                );
              })()}
              {showProjection && (
                <td className="mono heat-cell" style={{ "--heat": row.heat || 0 }}>
                  {formatProjection(row.projection)}
                </td>
              )}
              {showStatColumns &&
                STAT_COLUMNS.map((c) => (
                  <td key={c.key} className="mono">
                    {formatStat(row[c.key])}
                  </td>
                ))}
              {showNotes && <td className="tool-notes">{row.notes || ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
