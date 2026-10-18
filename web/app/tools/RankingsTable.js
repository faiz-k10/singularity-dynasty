"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import TeamBadge from "./TeamBadge";
import OutcomeCurve from "./OutcomeCurve";
import WeeklyDetailRow from "./WeeklyDetailRow";
import { isBye, BYE_LABEL } from "@/lib/bye";
import { MyBadge } from "./MyPlayers";
import { matchupTint } from "./MatchupBadge";
import { STAT_COLUMNS } from "./statColumns";
import { getAchievements } from "./achievements";
import AchievementDots from "./AchievementDots";

// Weekly floor/ceiling formatting -- null for rows published before
// migration 0029 added these columns, until the next model re-run.
function formatRange(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(1);
}

// The raw weekly-average component stats (Redraft only, via
// showStatColumns) -- shown as their own columns rather than tucked
// behind a click, so they're visible right in the table. Not every
// column applies to every position (a WR has no passing_yards) --
// STAT_COLUMNS (statColumns.js) just reads whatever's in scoring_stats
// and renders "—" for a column a given player's position doesn't
// publish. WeeklyDetailRow.js reuses the same list for its percentile
// rows, from that shared module rather than from each other.
function formatStat(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(1);
}

// A tiny constellation of dots, not a repeat of the full badge row --
// the collapsed table is dense and the expanded banner already owns the
// real click-to-expand badges (WeeklyDetailRow.js), so this is just a
// glance-able "this player has flags, expand to see which" hint. Colored
// per achievements.js's own `variant`, so a row with a gold star and a
// the row's own click already opens the row, so the dots don't need
// their own click target. Lives in the Rank cell (stacked vertically,
// between the rank number and the position color bar on the cell's left
// edge) rather than next to the name -- sitting right on the same
// signal as the color bar (both are "at-a-glance metadata about this
// row") reads more intentional than crowding the name column, and a
// name of any length can't push it around. The dot component itself is
// shared (AchievementDots.js) -- every other tool page showing these
// same badges reuses it too.

function PlayerCell({ row, withPopover, owned }) {
  if (!withPopover) {
    return (
      <td className="player-cell">
        <MyBadge owned={owned} />
        {row.player_name}
      </td>
    );
  }
  return (
    <td className="player-cell">
      <MyBadge owned={owned} />
      <span className="player-hover" tabIndex={0}>
        {row.player_name}
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
            {row.notes && (
              <div className="player-popover-notes">{row.notes}</div>
            )}
            <Link
              href={`/tools/compare-players?p1=${encodeURIComponent(row.player_name)}`}
              className="player-popover-compare"
              prefetch={false}
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
  toolbar, // the shared filter toolbar (RankingsToolbar), rendered in the full-screen bar so both views look identical
  badgeFilterOn, // a badge filter is active (only changes the empty-state message)
  mineStatus, // "signedOut" | "noTeams" | "ready" -- what the far-right Your player panel says for a player who isn't on any of the viewer's teams
  ownedByName, // Map of player_name -> where he sits on the viewer's saved teams (MyPlayers.js)
  myViewOn,
  gated,
}) {
  const sortProps = { activeSort: sortKey, activeDir: sortDir, currentParams, sortParam, dirParam };
  // Click-to-expand/collapse, keyed by the same string the row itself is
  // keyed by -- a Set rather than one active key, so multiple rows can be
  // open at once (comparing several players' curves side by side without
  // losing the earlier one every time a new row is clicked). Only
  // meaningful here when a row actually has a floor/ceiling curve to
  // expand into (WeeklyDetailRow's reason for existing), so rows
  // published before migration 0029 with no floor/ceiling yet just
  // aren't clickable.
  const [expanded, setExpanded] = useState(() => new Set());
  function toggleExpanded(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Theater mode: the table wrap goes position:fixed edge-to-edge over the whole viewport (globals.css
  // .rankings-table-wrap.theater) -- a wide table with many stat columns is exactly the case page margins cost the
  // most real width. Body scroll is locked while active; Escape closes it like the visible button. The fixed overlay
  // sits above the page's own filter toolbar, so RankingsSearch hands the SAME toolbar element in as `toolbar` and
  // the full-screen bar renders it: one set of controls, one look, one piece of state.
  const [theater, setTheater] = useState(false);
  useEffect(() => {
    if (!theater) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") setTheater(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [theater]);

  // Achievements computed once per row (not inline in the render loop below) for the dots/badges.
  const displayRows = useMemo(
    () =>
      rows.map((row) => ({
        row,
        achievements: showCurve && row.floor != null && row.ceiling != null ? getAchievements(row) : [],
      })),
    [rows, showCurve]
  );

  const colCount =
    2 + // Rank, Player
    (showPosition ? 1 : 0) +
    (showTeam ? 1 : 0) + // Matchup (merged) or Team -- always exactly one column
    (showRange ? 3 : 0) + // Median, Floor, Ceiling
    (showCurve ? 1 : 0) +
    (showStatColumns ? STAT_COLUMNS.length : 0) +
    (showNotes ? 1 : 0);

  return (
    <>
      <div className={`rankings-theater-bar${theater ? " theater" : ""}`}>
        {theater && toolbar && <div className="rankings-theater-controls">{toolbar}</div>}
        <button
          type="button"
          className="rankings-theater-btn"
          onClick={() => setTheater((v) => !v)}
          aria-label={theater ? "Exit full-screen view" : "Expand to full-screen view"}
          title={theater ? "Exit full-screen view" : "Expand to full-screen view"}
        >
          {theater ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M4 15h3a2 2 0 0 1 2 2v3M15 20v-3a2 2 0 0 1 2-2h3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4H6a2 2 0 0 0-2 2v3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M15 20h3a2 2 0 0 0 2-2v-3" />
            </svg>
          )}
        </button>
      </div>
      <div
        className={`rankings-table-wrap${tableClassName ? ` ${tableClassName}-wrap` : ""}${theater ? " theater" : ""}`}
      >
      <table className={`rankings-table${tableClassName ? ` ${tableClassName}` : ""}`}>
        <thead>
          <tr>
            <SortableTh label="Rank" sortKey="rank" {...sortProps} />
            <SortableTh label="Player" sortKey="player_name" {...sortProps} />
            {showPosition && <SortableTh label="Pos" sortKey="position" {...sortProps} />}
            {showRange && <SortableTh label="Projection" sortKey="projection" {...sortProps} />}
            {showTeam && showOpponent ? (
              <th>Matchup</th>
            ) : (
              showTeam && <SortableTh label="Team" sortKey="team" {...sortProps} />
            )}
            {showRange && <SortableTh label="Floor" sortKey="floor" {...sortProps} />}
            {showCurve && (
              <th title="Outcome curve — this week's floor-to-ceiling range, colored apart from the tails beyond it. The range's width is drawn relative to the widest range in this week's pool, so a locked-in projection and a volatile one are easy to tell apart at a glance. Click a row to see a larger, fully-labeled version plus percentile context.">
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
          {displayRows.map(({ row, achievements }) => {
            const rowKey = `${row.position}-${row.rank}`;
            // A team on its bye has no game, so nothing about this week is shown for him (no rank, projection range,
            // stat line or opened panel) -- just who he is and "BYE WEEK" in the Matchup column.
            const bye = isBye(row.opponent);
            const hasDetail = !bye && showCurve && row.floor != null && row.ceiling != null;
            const isExpanded = hasDetail && expanded.has(rowKey);
            return (
              <Fragment key={rowKey}>
                <tr
                  data-pos={row.position}
                  className={hasDetail ? "row-expandable" : undefined}
                  onClick={hasDetail ? () => toggleExpanded(rowKey) : undefined}
                  role={hasDetail ? "button" : undefined}
                  tabIndex={hasDetail ? 0 : undefined}
                  aria-expanded={hasDetail ? isExpanded : undefined}
                  onKeyDown={
                    hasDetail
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpanded(rowKey);
                          }
                        }
                      : undefined
                  }
                >
                  <td className="mono rank-cell">
                    {bye ? (
                      "—"
                    ) : (
                      <>
                        <AchievementDots achievements={achievements} vertical />
                        {row.displayRank}
                      </>
                    )}
                  </td>
                  <PlayerCell row={row} withPopover={popoverOnName && !bye} owned={ownedByName?.get(row.player_name)} />
                  {showPosition && (
                    <td className="mono align-left">
                      {row.position}
                      {!bye && row.positionLabel && row.positionLabel !== row.position && (
                        <span className="pos-rank">{row.positionLabel.slice(row.position.length)}</span>
                      )}
                    </td>
                  )}
                  {showRange && (
                    <td className="mono median-cell" title={bye ? undefined : "Median projection for this week"}>
                      {bye || row.projection == null ? "—" : Number(row.projection).toFixed(1)}
                    </td>
                  )}
                  {showTeam && showOpponent ? (
                    (() => {
                      const tint = bye ? null : matchupTint(row.matchup_mult);
                      // is_home is null for rows published before migration
                      // 0032 (or when the schedule lookup failed) -- a
                      // neutral "·" rather than guessing vs/@ in that case.
                      const sep = row.is_home === true ? "vs" : row.is_home === false ? "@" : "·";
                      return (
                        <td
                          className={`mono${tint ? ` matchup-cell ${tint.cls}` : ""}`}
                          style={tint ? { "--heat": tint.heat } : undefined}
                          title={tint ? tint.label : undefined}
                        >
                          <span className="matchup-combined-cell">
                            <TeamBadge team={row.team} />
                            {isBye(row.opponent) ? (
                              <span className="matchup-bye">{BYE_LABEL}</span>
                            ) : (
                              <>
                                <span className="matchup-sep">{sep}</span>
                                <TeamBadge team={row.opponent} />
                              </>
                            )}
                          </span>
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
                    <td className="mono heat-cell-floor" style={{ "--heat": bye ? 0 : row.floorHeat || 0 }}>
                      {bye ? "—" : formatRange(row.floor)}
                    </td>
                  )}
                  {showCurve && (
                    <td>
                      {!bye && (
                        <OutcomeCurve
                          floor={row.floor}
                          median={row.projection}
                          ceiling={row.ceiling}
                          maxSpread={maxSpread}
                        />
                      )}
                    </td>
                  )}
                  {showRange && (
                    <td className="mono heat-cell" style={{ "--heat": bye ? 0 : row.ceilingHeat || 0 }}>
                      {bye ? "—" : formatRange(row.ceiling)}
                    </td>
                  )}
                  {showStatColumns &&
                    STAT_COLUMNS.map((c) => (
                      <td key={c.key} className="mono">
                        {bye ? "—" : formatStat(row[c.key])}
                      </td>
                    ))}
                  {showNotes && <td className="tool-notes">{row.notes || ""}</td>}
                </tr>
                {isExpanded && <WeeklyDetailRow row={row} colSpan={colCount} maxSpread={maxSpread} owned={ownedByName?.get(row.player_name)} mineStatus={mineStatus} />}
              </Fragment>
            );
          })}
          {displayRows.length === 0 && myViewOn && (
            <tr>
              <td colSpan={colCount} className="rankings-table-empty">
                {gated
                  ? "None of your players are in the free view \u2014 the full list unlocks with Explorer."
                  : "None of your players are in this list."}
              </td>
            </tr>
          )}
          {displayRows.length === 0 && badgeFilterOn && (
            <tr>
              <td colSpan={colCount} className="rankings-table-empty">
                No players match the selected badges this week.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </>
  );
}
