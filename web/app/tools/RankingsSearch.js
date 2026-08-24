"use client";

import { useMemo, useState } from "react";
import RankingsTable from "./RankingsTable";

// Shared by both Redraft Rankings toggle views. Overall: just the search
// box, every position combined into one table. By Position: the same
// single combined table, filtered by whichever positions the caller has
// selected (any combination of QB/RB/WR/TE). Sorting stays server-driven
// via the existing URL-param mechanism in both cases; the search text is
// the only client state owned here -- which positions are selected, and
// the filter-row UI for picking them, are owned by the parent
// (RedraftRankingsClient) so that row can live inside the scoring-
// settings accordion instead of a second separate box.
export default function RankingsSearch({
  rows,
  sortKey,
  sortDir,
  currentParams,
  positions, // omit (or pass []) to skip position filtering entirely
  selected, // currently-selected positions, owned by the parent
  tableClassName = "",
  renderDetail, // optional (row) => ReactNode, forwarded to RankingsTable
}) {
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [query, setQuery] = useState("");

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
          tableClassName={tableClassName}
          renderDetail={renderDetail}
        />
      )}
    </>
  );
}
