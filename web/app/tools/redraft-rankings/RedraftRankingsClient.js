"use client";

import { useMemo, useState } from "react";
import RankingsSearch from "../RankingsSearch";
import { sortRows } from "@/lib/sortLink";
import useClientSort from "../useClientSort";

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
  projection: "number",
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
export default function RedraftRankingsClient({ rawRows, sortKey: initialKey, sortDir: initialDir, currentParams, positions, maxSpread, header, actions, mine, gated }) {
  const { sortKey, sortDir, onSort } = useClientSort(initialKey, initialDir);
  const [selectedPositions, setSelectedPositions] = useState(positions || []);
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
      onSort={onSort}
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
      actions={actions}
    />
  );
}
