"use client";

import { useMemo, useState } from "react";
import RankingsSearch from "../RankingsSearch";
import { sortRows } from "@/lib/sortLink";

const STAT_COLUMN_KEYS = [
  "passing_yards", "passing_tds", "passing_interceptions",
  "rushing_yards", "rushing_tds",
  "receptions", "receiving_yards", "receiving_tds",
];
const COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  opponent: "string",
  floor: "number",
  ceiling: "number",
  notes: "string",
  ...Object.fromEntries(STAT_COLUMN_KEYS.map((k) => [k, "number"])),
};

// Wraps RankingsSearch with the Position filter. `rawRows` arrive from
// the server already ranked, heat-tinted, and labeled (page.js does that
// work once, server-side) -- this component just re-sorts them for
// SortableTh clicks and lets RankingsSearch filter by position/search
// text. No client-side re-ranking happens here: floor/ceiling are always
// the model's fixed-scoring numbers (same as Player Season Simulations),
// so there's nothing for a custom-scoring panel to recompute -- that's
// why this page dropped the PPR/TE-premium settings panel it used to
// have (lib/scoring.js's computeCustomProjection only ever produced one
// recomputed number, not a distribution).
export default function RedraftRankingsClient({ rawRows, sortKey, sortDir, currentParams, positions, maxSpread, header, mine, gated }) {
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [selectedPositions, setSelectedPositions] = useState(positions || []);
  // Collapsed by default regardless of whether a non-default selection is
  // already active -- the always-visible value text next to the chevron
  // is what surfaces that without needing to open anything.
  const [positionOpen, setPositionOpen] = useState(false);

  function togglePosition(pos) {
    setSelectedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  }

  const rows = useMemo(
    () => sortRows(rawRows, sortKey, sortDir, COLUMN_TYPES),
    [rawRows, sortKey, sortDir]
  );

  return (
    <RankingsSearch
      rows={rows}
      sortKey={sortKey}
      sortDir={sortDir}
      currentParams={currentParams}
      positions={positions}
      selected={selectedPositions}
      onTogglePosition={togglePosition}
      tableClassName="redraft-table"
      showNotes={false}
      showStatColumns
      showCurve
      maxSpread={maxSpread}
      mine={mine}
      gated={gated}
      header={header}
      rightExtra={
        showPositionFilter && (
          <div className="filter-accordion">
            <div className="filter-row">
              <button
                type="button"
                className="filter-row-header"
                onClick={() => setPositionOpen((v) => !v)}
                aria-expanded={positionOpen}
              >
                <span className={`filter-row-chevron${positionOpen ? " filter-row-chevron-open" : ""}`}>▸</span>
                <span className="tier-toggle-label">Position</span>
                <span className={`filter-row-value${selectedPositions.length < positions.length ? " filter-row-value-active" : ""}`}>
                  {selectedPositions.length === positions.length ? "All" : selectedPositions.length === 0 ? "None" : selectedPositions.join(", ")}
                </span>
              </button>
              {positionOpen && (
                <div className="position-filter-row">
                  {positions.map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      className={`position-pill ${selectedPositions.includes(pos) ? "active" : ""}`}
                      onClick={() => togglePosition(pos)}
                      aria-pressed={selectedPositions.includes(pos)}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      }
    />
  );
}
