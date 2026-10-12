"use client";

import { useMemo, useState } from "react";
import RankingsTable from "./RankingsTable";
import { MyPlayersFilter, useMyView } from "./MyPlayers";

// Search box + combined table, optionally filtered to a subset of
// positions (any combination of QB/RB/WR/TE). Sorting stays server-driven
// via the existing URL-param mechanism; the search text is the only
// client state owned here -- which positions are selected, and the
// filter-row UI for picking them, are owned by the parent
// (RedraftRankingsClient) and passed in as `rightExtra`.
export default function RankingsSearch({
  rows,
  sortKey,
  sortDir,
  currentParams,
  positions, // omit (or pass []) to skip position filtering entirely
  selected, // currently-selected positions, owned by the parent
  onTogglePosition, // owned by the parent -- forwarded to RankingsTable so theater mode can carry its own copy of the position pills, same reasoning as searchValue/onSearchChange below
  tableClassName = "",
  showStatColumns = false,
  showCurve = false,
  showNotes = true,
  maxSpread,
  header, // optional -- when set, wraps header (left) + rightExtra/search (right) in the same
  rightExtra, // top-right split layout Player Sims uses, rendered above the search box
  mine, // the viewer's saved teams (lib/myPlayers.js) -- adds the My players view
  gated, // true when the viewer only sees a teaser slice of the table
}) {
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [query, setQuery] = useState("");
  const myView = useMyView(mine, rows);

  const filteredRows = useMemo(() => {
    let out = rows;
    if (showPositionFilter) {
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
  }, [rows, selected, query, showPositionFilter, myView.on, myView.ownedByName]);

  const searchRow = (
    <div className="player-search-row">
      <input
        type="search"
        className="player-search-input"
        placeholder="Search a player's name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search players"
      />
      {(query || (showPositionFilter && selected.length < positions.length)) && (
        <span className="player-search-count">
          {filteredRows.length} of {rows.length}
        </span>
      )}
    </div>
  );
  const myFilter = <MyPlayersFilter mine={mine} view={myView} gated={gated} />;

  return (
    <>
      {header ? (
        <div className="tool-header-split">
          <div className="tool-header-left">{header}</div>
          <div className="tool-header-right">
            {rightExtra}
            {searchRow}
            {myFilter}
          </div>
        </div>
      ) : (
        <>
          {searchRow}
          {myFilter}
        </>
      )}

      {showPositionFilter && selected.length === 0 ? (
        <div className="tool-empty">
          <p>Pick at least one position above.</p>
        </div>
      ) : (
        <RankingsTable
          rows={filteredRows}
          showPosition
          showOpponent
          showRange
          showCurve={showCurve}
          showNotes={showNotes}
          maxSpread={maxSpread}
          sortKey={sortKey}
          sortDir={sortDir}
          currentParams={currentParams}
          tableClassName={tableClassName}
          showStatColumns={showStatColumns}
          searchValue={query}
          onSearchChange={setQuery}
          positions={positions}
          selectedPositions={selected}
          onTogglePosition={onTogglePosition}
          ownedByName={myView.ownedByName}
          mineStatus={!mine ? undefined : !mine.signedIn ? "signedOut" : mine.teams.length === 0 ? "noTeams" : "ready"}
          myViewOn={myView.on}
          gated={gated}
        />
      )}
    </>
  );
}
