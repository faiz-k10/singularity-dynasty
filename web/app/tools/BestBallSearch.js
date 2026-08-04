"use client";

import { useMemo, useState } from "react";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import ConfidenceBadge from "./ConfidenceBadge";

function formatScore(value) {
  return value === null || value === undefined ? "—" : Math.round(Number(value));
}

// "21-25" when a range is published, falling back to the single ceiling
// number if ceiling_range_low hasn't been uploaded for this row yet.
function formatCeilingRange(row) {
  if (row.ceiling_score === null || row.ceiling_score === undefined) return "—";
  const high = Math.round(Number(row.ceiling_score));
  if (row.ceiling_range_low === null || row.ceiling_range_low === undefined) return String(high);
  return `${Math.round(Number(row.ceiling_range_low))}-${high}`;
}

// Same pattern as RankingsSearch (Redraft): position-pill filter + player
// name search, both client-side. Sorting stays server-driven via the
// existing URL-param mechanism.
export default function BestBallSearch({ rows, sortKey, sortDir, currentParams, positions }) {
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [selected, setSelected] = useState(positions || []);
  const [query, setQuery] = useState("");
  const sortProps = { activeSort: sortKey, activeDir: sortDir, currentParams };

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
        <div className="rankings-table-wrap">
          <table className="rankings-table">
            <thead>
              <tr>
                <SortableTh label="Rank" sortKey="rank" {...sortProps} />
                <SortableTh label="Player" sortKey="player_name" {...sortProps} />
                <SortableTh label="Pos" sortKey="position" {...sortProps} />
                <SortableTh label="Team" sortKey="team" {...sortProps} />
                <SortableTh label="Opp" sortKey="opponent" {...sortProps} />
                <SortableTh label="This Week" sortKey="ceiling_score" {...sortProps} />
                <SortableTh
                  label="Playoffs (Wk 15-17)"
                  sortKey="playoff_ceiling_score"
                  {...sortProps}
                />
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.rank}>
                  <td className="mono">{row.rank}</td>
                  <td>
                    <ConfidenceBadge confidence={row.sample_confidence} /> {row.player_name}{" "}
                    <TrendTag trend={row.trend} />
                  </td>
                  <td className="mono">{row.positionLabel || row.position}</td>
                  <td className="mono">{row.team || "—"}</td>
                  <td className="mono">{row.opponent || "—"}</td>
                  <td className="mono ceiling-cell">
                    {formatCeilingRange(row)}
                    {row.ceiling_probability !== null &&
                      row.ceiling_probability !== undefined && (
                        <span className="ceiling-pct">{row.ceiling_probability}%</span>
                      )}
                  </td>
                  <td className="mono">{formatScore(row.playoff_ceiling_score)}</td>
                  <td className="tool-notes">{row.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
