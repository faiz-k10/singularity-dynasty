"use client";

import { useMemo, useState } from "react";
import RankingsTable from "./RankingsTable";
import RankingsToolbar from "./RankingsToolbar";
import { matchesBadgeFilters } from "./badgeFilters";
import { getAchievementsCached } from "./achievements";
import { MyPlayersFilter, MyPlayersNote, useMyView } from "./MyPlayers";

// The Weekly Projection Rankings page's top block and table: title row (title left, Compare Players
// right), one filter toolbar (search, position pills, All players / My players), then the table. Sorting happens in
// the browser (the parent's useClientSort, passed as onSort); the search text is the only state owned here -- which positions are
// selected is owned by the parent (RedraftRankingsClient) and passed in as `selected` / `onTogglePosition`.
export default function RankingsSearch({
  rows,
  sortKey,
  sortDir,
  onSort,
  currentParams,
  positions, // omit (or pass []) to skip position filtering entirely
  selected, // currently-selected positions, owned by the parent
  onTogglePosition, // owned by the parent -- forwarded to RankingsTable so theater mode can carry its own copy of the position pills, same reasoning as searchValue/onSearchChange below
  tableClassName = "",
  showStatColumns = false,
  showCurve = false,
  showNotes = true,
  maxSpread,
  header, // the title block (eyebrow + h1), left of the top row
  actions, // the links/buttons at the right of the top row (Compare Players)
  mine, // the viewer's saved teams (lib/myPlayers.js) -- adds the My players view
  gated, // true when the viewer only sees a teaser slice of the table
  compareHref, // a Compare Players button at the end of the toolbar (Weekly Projection Rankings)
}) {
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [query, setQuery] = useState("");
  const [badgeIds, setBadgeIds] = useState(() => new Set());
  const [badgeMatch, setBadgeMatch] = useState("or"); // "or": any selected badge; "and": all of them
  const [teamIds, setTeamIds] = useState(() => new Set());
  function toggleTeam(t) {
    setTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }
  const myView = useMyView(mine, rows);
  function toggleBadge(id) {
    setBadgeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredRows = useMemo(() => {
    let out = rows;
    if (badgeIds.size > 0) {
      out = out.filter((row) => {
        const ach = showCurve && row.floor != null && row.ceiling != null ? getAchievementsCached(row) : [];
        return matchesBadgeFilters(ach, badgeIds, badgeMatch);
      });
    }
    if (teamIds.size > 0) {
      out = out.filter((row) => teamIds.has(row.team));
    }
    // No position selected = no position filter (show everyone), same as all four selected.
    if (showPositionFilter && selected.length > 0) {
      out = out.filter((row) => selected.includes(row.position));
    }
    if (myView.on) {
      out = out.filter((row) => myView.ownedByName.has(row.player_name));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((row) => row.player_name.toLowerCase().includes(q));
    }
    return out;
  }, [rows, selected, query, showPositionFilter, myView.on, myView.ownedByName, badgeIds, badgeMatch, showCurve, teamIds]);

  // The table keeps every row mounted and just hides the filtered-out ones, so changing a filter -- in either
  // direction -- is a cheap show / hide, never a rebuild of hundreds of rows, and never shows a stale list.
  const visibleRows = useMemo(() => new Set(filteredRows), [filteredRows]);

  const filtering = query.trim() !== "" || (showPositionFilter && selected.length > 0 && selected.length < positions.length) || badgeIds.size > 0 || teamIds.size > 0;
  const note = <MyPlayersNote mine={mine} view={myView} gated={gated} />;
  const toolbar = (
    <RankingsToolbar
      positions={positions}
      selected={selected}
      onTogglePosition={onTogglePosition}
      badgeIds={badgeIds}
      onToggleBadge={toggleBadge}
      onClearBadges={() => setBadgeIds(new Set())}
      badgeMatch={badgeMatch}
      onBadgeMatch={setBadgeMatch}
      shownCount={filteredRows.length}
      totalCount={rows.length}
      query={query}
      onQuery={setQuery}
      view={<MyPlayersFilter mine={mine} view={myView} gated={gated} compact />}
      teamIds={teamIds}
      onToggleTeam={toggleTeam}
      onClearTeams={() => setTeamIds(new Set())}
      compareHref={compareHref}
    />
  );

  return (
    <>
      {(header || actions) && (
        <div className="rk-top">
          <div className="rk-top-title">{header}</div>
          {actions && <div className="rk-top-actions">{actions}</div>}
        </div>
      )}

      {(myView.on || filtering) && (
        <p className="rk-status">
          {note}
          {!myView.on && (
            <span className="my-filter-note">
              {filteredRows.length} of {rows.length} players
            </span>
          )}
        </p>
      )}

      <RankingsTable
        rows={rows}
        visibleRows={visibleRows}
        showPosition
        showOpponent
        showRange
        showCurve={showCurve}
        showNotes={showNotes}
        maxSpread={maxSpread}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        currentParams={currentParams}
        tableClassName={tableClassName}
        showStatColumns={showStatColumns}
        toolbar={toolbar}
        badgeFilterOn={badgeIds.size > 0}
        ownedByName={myView.ownedByName}
        mineStatus={!mine ? undefined : !mine.signedIn ? "signedOut" : mine.teams.length === 0 ? "noTeams" : "ready"}
        myViewOn={myView.on}
        gated={gated}
      />
    </>
  );
}
