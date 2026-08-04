"use client";

import { useMemo, useState } from "react";
import RankingsTable from "./RankingsTable";

// Shared by both Redraft Rankings toggle views. Overall: just the search
// box, every position combined into one table. By Position: the same
// single combined table, plus multi-select position pills (any
// combination of QB/RB/WR/TE) filtering which rows show. Sorting stays
// server-driven via the existing URL-param mechanism in both cases; only
// which positions are selected and the search text are client state.
export default function RankingsSearch({
  rows,
  sortKey,
  sortDir,
  currentParams,
  positions, // omit (or pass []) to hide the position-pill row entirely
}) {
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [selected, setSelected] = useState(positions || []);
  const [query, setQuery] = useState("");

  function toggle(pos) {
    setSelected((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  }

  const filteredRows = useMemo(() => {
    let out = rows;
    if (showPositionFilter) {
      out = out.filter((row) => selected.includes(row.position));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((row) => row.player_name.toLowerCase().includes(q));
    }
    return out;
  }, [rows, selected, query, showPositionFilter]);

  return (
    <>
      {showPositionFilter && (
        <div className="position-filter-row">
          {positions.map((pos) => (
            <button
              key={pos}
              type="button"
              className={`position-pill ${selected.includes(pos) ? "active" : ""}`}
              onClick={() => toggle(pos)}
              aria-pressed={selected.includes(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
      )}

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

      {showPositionFilter && selected.length === 0 ? (
        <div className="tool-empty">
          <p>Pick at least one position above.</p>
        </div>
      ) : (
        <RankingsTable
          rows={filteredRows}
          showPosition
          showOpponent
          showProjection
          sortKey={sortKey}
          sortDir={sortDir}
          currentParams={currentParams}
        />
      )}
    </>
  );
}
