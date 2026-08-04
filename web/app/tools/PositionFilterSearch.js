"use client";

import { useMemo, useState } from "react";
import RankingsTable from "./RankingsTable";

// By Position view: pick which position(s) to show (multi-select — any
// combination), and search by name within whatever's currently visible.
// Sorting per position stays server-driven via each column's own
// ?xx_sort=/&xx_dir= URL params (positionData is pre-sorted server-side);
// which columns are VISIBLE and the search text are both client state.
//
// Narrower selection = richer columns: with 3-4 positions on screen at
// once there isn't room for more than rank+player (team/proj/notes go in
// the hover popover instead), but drop down to 1-2 positions and each
// column gets full-width room to show Team/Proj/Notes outright.
export default function PositionFilterSearch({ positions, positionData, currentParams }) {
  const [selected, setSelected] = useState(positions);
  const [query, setQuery] = useState("");

  function toggle(pos) {
    setSelected((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  }

  const visible = positions.filter((pos) => selected.includes(pos));
  const expanded = visible.length > 0 && visible.length <= 2;
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const out = {};
    visible.forEach((pos) => {
      const rows = positionData[pos]?.rows || [];
      out[pos] = q ? rows.filter((r) => r.player_name.toLowerCase().includes(q)) : rows;
    });
    return out;
  }, [visible, positionData, q]);

  return (
    <>
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

      <div className="player-search-row">
        <input
          type="search"
          className="player-search-input"
          placeholder="Search a player's name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players"
        />
      </div>

      <p className="tool-hint">
        {expanded
          ? "Team, projection, trend, and notes shown in full — pick more positions to compact the view."
          : "Hover or tap a name for projection, team, and notes. Pick fewer positions to expand the columns."}
      </p>

      {visible.length === 0 ? (
        <div className="tool-empty">
          <p>Pick at least one position above.</p>
        </div>
      ) : (
        <div className="position-columns">
          {visible.map((pos) => {
            const pd = positionData[pos];
            return (
              <div className="position-col" key={pos}>
                <div className="draft-round-title">
                  {pos} · {filtered[pos].length}
                </div>
                <RankingsTable
                  rows={filtered[pos]}
                  showPosition={false}
                  showTeam={expanded}
                  showProjection={expanded}
                  showNotes={expanded}
                  popoverOnName={!expanded}
                  sortKey={pd.sortKey}
                  sortDir={pd.sortDir}
                  currentParams={currentParams}
                  sortParam={pd.sortParam}
                  dirParam={pd.dirParam}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
