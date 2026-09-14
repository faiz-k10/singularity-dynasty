"use client";

import { useMemo, useState } from "react";
import RankingsTable from "./RankingsTable";

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
  tableClassName = "",
  showStatColumns = false,
  showCurve = false,
  maxSpread,
  header, // optional -- when set, wraps header (left) + rightExtra/search (right) in the same
  rightExtra, // top-right split layout Player Sims uses, rendered above the search box
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

  return (
    <>
      {header ? (
        <div className="tool-header-split">
          <div className="tool-header-left">{header}</div>
          <div className="tool-header-right">
            {rightExtra}
            {searchRow}
          </div>
        </div>
      ) : (
        searchRow
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
          maxSpread={maxSpread}
          sortKey={sortKey}
          sortDir={sortDir}
          currentParams={currentParams}
          tableClassName={tableClassName}
          showStatColumns={showStatColumns}
        />
      )}
    </>
  );
}
