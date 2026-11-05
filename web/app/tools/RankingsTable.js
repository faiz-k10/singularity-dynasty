"use client";

import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import TeamBadge from "./TeamBadge";
import OutcomeCurve from "./OutcomeCurve";
import WeeklyDetailRow from "./WeeklyDetailRow";
import { isBye, BYE_LABEL } from "@/lib/bye";
import { mineClass } from "./MyPlayers";
import { matchupTint } from "./MatchupBadge";
import { STAT_COLUMNS } from "./statColumns";
import { getAchievementsCached } from "./achievements";
import AchievementDots from "./AchievementDots";
import useProgressiveCount from "./useProgressiveCount";

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
      <td className={`player-cell${mineClass(owned)}`}>
        {row.player_name}
      </td>
    );
  }
  return (
    <td className={`player-cell${mineClass(owned)}`}>
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

// The cells of a row, memoised on their own so showing / hiding a row (RankingRow below just flips a class)
// doesn't re-render the curve, logos and numbers inside it.
const RowCells = memo(function RowCells({
  row, achievements, bye, showPosition, showTeam, showOpponent, showRange, showCurve, showNotes, showStatColumns,
  popoverOnName, maxSpread, owned,
}) {
  return (
    <>
    <td className="mono rank-cell">
      <AchievementDots achievements={achievements} vertical />
      {bye ? "—" : row.displayRank}
    </td>
    <PlayerCell row={row} withPopover={popoverOnName && !bye} owned={owned} />
    {showPosition && (
      <td className="mono align-left">
        {row.position}
        {!bye && row.positionLabel && row.positionLabel !== row.position && (
          <span className="pos-rank">{row.positionLabel.slice(row.position.length)}</span>
        )}
      </td>
    )}
    {showRange && (
      <td className="mono median-cell">
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
      <td className="mono heat-cell-ceiling" style={{ "--heat": bye ? 0 : row.ceilingHeat || 0 }}>
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
    </>
  );
});

// One table row (plus its opened panel). Memoised so a filter change -- which only adds or removes rows -- doesn't
// re-render the hundreds of rows that are unchanged (each carries an inline SVG curve and team logos); that
// re-render was what made the badge / team / position filters feel slow.
const RankingRow = memo(function RankingRow({
  row, achievements, hidden, isExpanded0, onToggle, showPosition, showTeam, showOpponent, showRange, showCurve, showNotes,
  showStatColumns, popoverOnName, maxSpread, owned, mineStatus, colCount,
}) {
  const rowKey = `${row.position}-${row.rank}`;
  // A team on its bye has no game, so nothing about this week is projected for him (no rank, projection range or stat line in the
  // row) -- just who he is and "BYE WEEK" in the Matchup column. His row still opens to his profile: identity, last week, usage /
  // touchdown profile and recent games (WeeklyDetailRow swaps the outcome curve for a bye note).
  const bye = isBye(row.opponent);
  const hasDetail = showCurve && (bye || (row.floor != null && row.ceiling != null));
  const isExpanded = hasDetail && isExpanded0 && !hidden;
  // Opening a row scrolls it to sit directly under the table's sticky header (in full screen, under the panel's own header), dashboard below.
  const trRef = useRef(null);
  const wasOpen = useRef(isExpanded);
  useEffect(() => {
    if (isExpanded && !wasOpen.current) {
      const tr = trRef.current;
      const th = tr?.closest("table")?.querySelector("thead th");
      if (tr && th) {
        const scroller = tr.closest(".rankings-table-wrap.theater");
        // Full screen: the panel's own sticky header sits at its top. Normal page: the header scrolls away, so clear the site bar.
        const offset = scroller
          ? scroller.getBoundingClientRect().top + th.getBoundingClientRect().height
          : document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 72;
        const delta = tr.getBoundingClientRect().top - offset;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // Start the glide on the next frame, once the newly opened panel has painted, so the scroll doesn't stutter over its first layout.
        requestAnimationFrame(() => (scroller || window).scrollBy({ top: delta, behavior: reduce ? "auto" : "smooth" }));
      }
    }
    wasOpen.current = isExpanded;
  }, [isExpanded]);
  return (
    <Fragment key={rowKey}>
      <tr
        ref={trRef}
        data-pos={row.position}
        className={`${hasDetail ? "row-expandable" : ""}${hidden ? " row-filtered" : ""}` || undefined}
        onClick={hasDetail ? () => onToggle(rowKey) : undefined}
        role={hasDetail ? "button" : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        aria-expanded={hasDetail ? isExpanded : undefined}
        onKeyDown={
          hasDetail
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(rowKey);
                }
              }
            : undefined
        }
      >
        <RowCells
          row={row} achievements={achievements} bye={bye} showPosition={showPosition} showTeam={showTeam}
          showOpponent={showOpponent} showRange={showRange} showCurve={showCurve} showNotes={showNotes}
          showStatColumns={showStatColumns} popoverOnName={popoverOnName} maxSpread={maxSpread} owned={owned}
        />
      </tr>
      {isExpanded && <WeeklyDetailRow row={row} colSpan={colCount} maxSpread={maxSpread} owned={owned} mineStatus={mineStatus} />}
    </Fragment>
  );
});

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
  onSort,
  sortParam = "sort",
  dirParam = "dir",
  tableClassName = "",
  visibleRows, // optional Set of the row objects to show; the rest stay mounted but hidden (cheap filtering). Omit to show all
  toolbar, // the shared filter toolbar (RankingsToolbar), rendered in the full-screen bar so both views look identical
  badgeFilterOn, // a badge filter is active (only changes the empty-state message)
  mineStatus, // "signedOut" | "noTeams" | "ready" -- what the far-right Your player panel says for a player who isn't on any of the viewer's teams
  ownedByName, // Map of player_name -> where he sits on the viewer's saved teams (MyPlayers.js)
  myViewOn,
  gated,
}) {
  const sortProps = { activeSort: sortKey, activeDir: sortDir, currentParams, sortParam, dirParam, onSort };
  // Click-to-expand/collapse, keyed by the same string the row itself is
  // keyed by -- a Set rather than one active key, so multiple rows can be
  // open at once (comparing several players' curves side by side without
  // losing the earlier one every time a new row is clicked). Only
  // meaningful here when a row actually has a floor/ceiling curve to
  // expand into (WeeklyDetailRow's reason for existing), so rows
  // published before migration 0029 with no floor/ceiling yet just
  // aren't clickable.
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpanded = useCallback((key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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

  // Badges are worked out per MOUNTED row (cached per row object, achievements.js), so the first paint never pays for all ~480 rows.
  const displayRows = rows;

  const shownCount = visibleRows ? visibleRows.size : displayRows.length;
  const mounted = useProgressiveCount(displayRows.length); // rows on the page right now: the first chunk at once, the rest in idle time

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
        {toolbar && <div className="rankings-theater-controls">{toolbar}</div>}
        <button
          type="button"
          className="rankings-theater-btn"
          onClick={() => setTheater((v) => !v)}
          aria-label={theater ? "Exit full-screen view" : "Expand to full-screen view"}
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
              <th>
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
          {displayRows.slice(0, mounted).map((row) => {
            const achievements = showCurve && row.floor != null && row.ceiling != null ? getAchievementsCached(row) : [];
            const rowKey = `${row.position}-${row.rank}`;
            return (
              <RankingRow
                key={rowKey}
                row={row}
                achievements={achievements}
                hidden={!!visibleRows && !visibleRows.has(row)}
                isExpanded0={expanded.has(rowKey)}
                onToggle={toggleExpanded}
                showPosition={showPosition}
                showTeam={showTeam}
                showOpponent={showOpponent}
                showRange={showRange}
                showCurve={showCurve}
                showNotes={showNotes}
                showStatColumns={showStatColumns}
                popoverOnName={popoverOnName}
                maxSpread={maxSpread}
                owned={ownedByName?.get(row.player_name)}
                mineStatus={mineStatus}
                colCount={colCount}
              />
            );
          })}
          {shownCount === 0 && myViewOn && (
            <tr>
              <td colSpan={colCount} className="rankings-table-empty">
                {gated
                  ? "None of your players are in the free view \u2014 the full list unlocks with Explorer."
                  : "None of your players are in this list."}
              </td>
            </tr>
          )}
          {shownCount === 0 && badgeFilterOn && (
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
