"use client";

import { useState } from "react";
import StatRadar from "./StatRadar";
import PercentileCard from "./PercentileCard";

const LAYERS = [
  { key: "floor", label: "Floor" },
  { key: "median", label: "Median" },
  { key: "ceiling", label: "Ceiling" },
];

// The same three-mode selection as StatDetailRow's own stat table/radar
// (see PlayerSimSearch.js), just shared across every compared player at
// once instead of one -- click a stat under any single player's card and
// every other player's radar + percentile card highlights that same
// stat, so "who's better at X" reads directly across the row instead of
// needing to hold three separate percentile numbers in your head.
// players is [{name, position, positionLabel, percentileStats,
// radarEntries, radarStartDeg}, ...], built server-side in
// compare-player-sims/page.js the same way PlayerSimSearch.js builds a
// single player's own radar/percentile data.
export default function ComparePlayerRadars({ players }) {
  const [selection, setSelection] = useState(null);

  if (!players || players.length < 2) return null;

  function selectRow(key) {
    setSelection({ mode: "row", key, layer: null });
  }
  function selectColumn(layer) {
    setSelection({ mode: "column", key: null, layer });
  }
  function selectCell(key, layer) {
    setSelection({ mode: "cell", key, layer });
  }

  return (
    <div className="compare-radar-section">
      <div className="compare-radar-head">
        <h2>Percentile Shapes</h2>
        <p className="tool-sub">
          Click a stat on any player&apos;s radar or percentile list below to compare all {players.length} on it.
        </p>
        <div className="compare-radar-layer-toggle" role="group" aria-label="Compare one layer across every stat">
          {LAYERS.map((layer) => (
            <button
              key={layer.key}
              type="button"
              className={selection?.mode === "column" && selection.layer === layer.key ? "active" : ""}
              onClick={() => selectColumn(layer.key)}
              aria-pressed={selection?.mode === "column" && selection.layer === layer.key}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>
      <div className="compare-radar-grid" style={{ "--compare-radar-count": players.length }}>
        {players.map((p) => (
          <div key={p.name} className="compare-radar-card">
            <div className="compare-radar-card-head">
              <span className="compare-radar-card-name">{p.name}</span>
              <span className="compare-radar-card-pos mono">{p.positionLabel || p.position}</span>
            </div>
            <StatRadar entries={p.radarEntries} startDeg={p.radarStartDeg} selection={selection} onSelectKey={selectRow} pool={p.position} />
            <PercentileCard
              stats={p.percentileStats}
              position={p.position}
              selection={selection}
              onSelectCell={selectCell}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
