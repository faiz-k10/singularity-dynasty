import Link from "next/link";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import ConfidenceBadge from "./ConfidenceBadge";
import BounceBadge from "./BounceBadge";
import TeamBadge from "./TeamBadge";
import OutcomeCurve from "./OutcomeCurve";
import { matchupTint } from "./MatchupBadge";

// `notes` carries at most one flag: "OUT" (hard status, stays in the
// Notes column) or "BOUNCEBACK ..." (soft/informational, rendered as the
// trampoline BounceBadge next to the name instead). Empty otherwise.
const isBounceNote = (n) => typeof n === "string" && n.startsWith("BOUNCEBACK");

// Weekly floor/ceiling formatting -- null for rows published before
// migration 0029 added these columns, until the next model re-run.
function formatRange(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(1);
}

// The raw weekly-average component stats (Redraft only, via
// showStatColumns) -- shown as their own columns rather than tucked
// behind a click, so they're visible right in the table. Not every
// column applies to every position (a WR has no passing_yards) --
// STAT_COLUMNS just reads whatever's in scoring_stats and renders "—"
// for a column a given player's position doesn't publish.
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
        <BounceBadge note={row.notes} />
      </td>
    );
  }
  return (
    <td className="player-cell">
      <span className="player-hover" tabIndex={0}>
        <ConfidenceBadge confidence={row.sample_confidence} /> {row.player_name}{" "}
        <BounceBadge note={row.notes} />
        <div className="player-popover">
          <div className="player-popover-card">
            <div className="player-popover-row">
              <span>Team</span>
              <span>{row.team || "—"}</span>
            </div>
            <div className="player-popover-row">
              <span>Floor</span>
              <span>{formatRange(row.floor)}</span>
            </div>
            <div className="player-popover-row">
              <span>Ceiling</span>
              <span>{formatRange(row.ceiling)}</span>
            </div>
            <div className="player-popover-row">
              <span>Trend</span>
              <span><TrendTag trend={row.trend} /></span>
            </div>
            {row.notes && !isBounceNote(row.notes) && (
              <div className="player-popover-notes">{row.notes}</div>
            )}
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
  showRange = false,
  showCurve = false,
  maxSpread,
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
            {showTeam && showOpponent ? (
              <th>Matchup</th>
            ) : (
              showTeam && <SortableTh label="Team" sortKey="team" {...sortProps} />
            )}
            {showRange && <SortableTh label="Floor" sortKey="floor" {...sortProps} />}
            {showCurve && (
              <th title="Outcome curve — this week's floor-to-ceiling range, colored apart from the tails beyond it. The range's width is drawn relative to the widest range in this week's pool, so a locked-in projection and a volatile one are easy to tell apart at a glance.">
                Curve
              </th>
            )}
            {showRange && <SortableTh label="Ceiling" sortKey="ceiling" {...sortProps} />}
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
              {showTeam && showOpponent ? (
                (() => {
                  const tint = matchupTint(row.matchup_mult);
                  // is_home is null for rows published before migration
                  // 0032 (or when the schedule lookup failed) -- a
                  // neutral "·" rather than guessing vs/@ in that case.
                  const sep = row.is_home === true ? "vs" : row.is_home === false ? "@" : "·";
                  return (
                    <td
                      className={`mono matchup-combined-cell${tint ? ` matchup-cell ${tint.cls}` : ""}`}
                      style={tint ? { "--heat": tint.heat } : undefined}
                      title={tint ? tint.label : undefined}
                    >
                      <TeamBadge team={row.team} />
                      <span className="matchup-sep">{sep}</span>
                      <TeamBadge team={row.opponent} />
                    </td>
                  );
                })()
              ) : (
                showTeam && (
                  <td className="mono align-left">
                    <TeamBadge team={row.team} />
                  </td>
                )
              )}
              {showRange && (
                <td className="mono heat-cell" style={{ "--heat": row.floorHeat || 0 }}>
                  {formatRange(row.floor)}
                </td>
              )}
              {showCurve && (
                <td>
                  <OutcomeCurve
                    floor={row.floor}
                    median={row.projection}
                    ceiling={row.ceiling}
                    maxSpread={maxSpread}
                  />
                </td>
              )}
              {showRange && (
                <td className="mono heat-cell" style={{ "--heat": row.ceilingHeat || 0 }}>
                  {formatRange(row.ceiling)}
                </td>
              )}
              {showStatColumns &&
                STAT_COLUMNS.map((c) => (
                  <td key={c.key} className="mono">
                    {formatStat(row[c.key])}
                  </td>
                ))}
              {showNotes && (
                <td className="tool-notes">
                  {isBounceNote(row.notes) ? "" : row.notes || ""}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
