"use client";

import { useMemo, useState } from "react";
import RankingsTable from "./RankingsTable";

// Client-side name filter for the Overall view. Sorting stays server-driven
// via SortableTh's URL params (rows arrive pre-sorted); this only narrows
// which of those already-sorted rows are shown, instantly, no navigation.
export default function OverallSearch({ rows, sortKey, sortDir, currentParams }) {
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.player_name.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <>
      <div className="player-search-row">
        <input
          type="search"
          className="player-search-input"
          placeholder="Search a player's name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players"
        />
        {query && (
          <span className="player-search-count">
            {filteredRows.length} of {rows.length}
          </span>
        )}
      </div>
      <RankingsTable
        rows={filteredRows}
        showPosition
        showProjection
        sortKey={sortKey}
        sortDir={sortDir}
        currentParams={currentParams}
      />
    </>
  );
}
