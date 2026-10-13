"use client";

import { useMemo, useState } from "react";
import RankingsTable from "./RankingsTable";
import { MyPlayersFilter, MyPlayersNote, useMyView } from "./MyPlayers";

// The Weekly Projection Rankings page's top block and table: title row (title left, Compare Players / Export CSV
// right), one filter toolbar (search, position pills, All players / My players), then the table. Sorting stays
// server-driven via the URL-param mechanism; the search text is the only state owned here -- which positions are
// selected is owned by the parent (RedraftRankingsClient) and passed in as `selected` / `onTogglePosition`.
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
  header, // the title block (eyebrow + h1), left of the top row
  actions, // the links/buttons at the right of the top row (Compare Players, Export CSV)
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

  const filtering = query.trim() !== "" || (showPositionFilter && selected.length < positions.length);
  const note = <MyPlayersNote mine={mine} view={myView} gated={gated} />;

  return (
    <>
      {(header || actions) && (
        <div className="rk-top">
          <div className="rk-top-title">{header}</div>
          {actions && <div className="rk-top-actions">{actions}</div>}
        </div>
      )}

      <div className="rk-toolbar">
        <label className="rk-search">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2" />
          </svg>
          <input
            type="search"
            placeholder="Search a player's name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search players"
          />
        </label>
        {showPositionFilter && (
          <div className="rk-positions" role="group" aria-label="Positions">
            {positions.map((pos) => (
              <button
                key={pos}
                type="button"
                className={selected.includes(pos) ? "active" : ""}
                onClick={() => onTogglePosition(pos)}
                aria-pressed={selected.includes(pos)}
              >
                {pos}
              </button>
            ))}
          </div>
        )}
        <MyPlayersFilter mine={mine} view={myView} gated={gated} compact />
      </div>
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
