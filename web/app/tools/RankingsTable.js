"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import ConfidenceBadge from "./ConfidenceBadge";
import TeamBadge from "./TeamBadge";
import { matchupTint } from "./MatchupBadge";

function formatProjection(value) {
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
  popoverOnName = false,
  sortKey,
  sortDir,
  currentParams,
  sortParam = "sort",
  dirParam = "dir",
  tableClassName = "",
  renderDetail, // optional (row) => ReactNode -- when set, rows expand on click
}) {
  const sortProps = { activeSort: sortKey, activeDir: sortDir, currentParams, sortParam, dirParam };
  const [expanded, setExpanded] = useState(() => new Set());
  const columnCount =
    2 + [showPosition, showTeam, showOpponent, showProjection, showNotes].filter(Boolean).length;

  function toggleRow(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
            {showNotes && <th>Notes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowKey = `${row.position}-${row.rank}`;
            const isExpanded = renderDetail && expanded.has(rowKey);
            return (
              <Fragment key={rowKey}>
                <tr
                  data-pos={row.position}
                  className={renderDetail ? "row-expandable" : ""}
                  onClick={renderDetail ? () => toggleRow(rowKey) : undefined}
                >
                  <td className="mono">
                    {renderDetail && (
                      <span className={`row-expand-chevron${isExpanded ? " row-expand-chevron-open" : ""}`}>▸</span>
                    )}
                    {row.displayRank}
                  </td>
                  <PlayerCell row={row} withPopover={popoverOnName} />
                  {showPosition && <td className="mono align-left">{row.positionLabel || row.position}</td>}
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
                  {showNotes && <td className="tool-notes">{row.notes || ""}</td>}
                </tr>
                {isExpanded && (
                  <tr className="stat-detail-row">
                    <td colSpan={columnCount}>{renderDetail(row)}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
