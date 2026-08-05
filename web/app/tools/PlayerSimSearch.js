"use client";

import { Fragment, useMemo, useState } from "react";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import ConfidenceBadge from "./ConfidenceBadge";
import TeamBadge from "./TeamBadge";
import STAT_LABELS from "./statLabels";
import OutcomeCurve from "./OutcomeCurve";

// Detail row unfolded below a player when their name is clicked -- one
// open at a time (clicking a different player folds this one and opens
// theirs). colSpan must match the number of columns in the main row.
function StatDetailRow({ row, colSpan }) {
  const ranges = row.stat_ranges;
  const entries = STAT_LABELS.filter(([key]) => ranges && ranges[key]);
  // Clicking a stat row drives the odds curve beside the table -- defaults
  // to the first available stat so the curve is never empty on open.
  const [selectedKey, setSelectedKey] = useState(entries[0]?.[0]);
  const selectedEntry = entries.find(([key]) => key === selectedKey) || entries[0];

  if (entries.length === 0) return null;

  return (
    <tr className="stat-detail-row">
      <td colSpan={colSpan}>
        <div className="stat-detail-cols">
          <table className="stat-detail-table">
            <thead>
              <tr>
                <th>Stat</th>
                <th>Floor</th>
                <th>Median</th>
                <th>Ceiling</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, label]) => {
                const { floor, median, ceiling } = ranges[key];
                const isSelected = key === selectedKey;
                return (
                  <tr key={key} className={isSelected ? "stat-row-selected" : ""}>
                    <td>
                      <button
                        type="button"
                        className="stat-row-trigger"
                        onClick={() => setSelectedKey(key)}
                        aria-pressed={isSelected}
                      >
                        {label}
                      </button>
                    </td>
                    <td className="mono">{floor}</td>
                    <td className="mono">
                      <strong>{median}</strong>
                    </td>
                    <td className="mono">{ceiling}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <OutcomeCurve
            key={selectedEntry[0]}
            label={selectedEntry[1]}
            floor={ranges[selectedEntry[0]].floor}
            median={ranges[selectedEntry[0]].median}
            ceiling={ranges[selectedEntry[0]].ceiling}
          />
        </div>
      </td>
    </tr>
  );
}

// Same pattern as RankingsSearch (Redraft) / BestBallSearch: position-pill
// filter + player name search, both client-side. Sorting stays
// server-driven via the existing URL-param mechanism.
export default function PlayerSimSearch({ rows, sortKey, sortDir, currentParams, positions, maxCeiling }) {
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [selected, setSelected] = useState(positions || []);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null); // player_name currently unfolded, or null
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
                <SortableTh label="Player" sortKey="player_name" {...sortProps} />
                <SortableTh label="Pos" sortKey="position" {...sortProps} />
                <SortableTh label="Team" sortKey="team" {...sortProps} />
                <SortableTh label="Floor" sortKey="floor" {...sortProps} />
                <SortableTh label="Median" sortKey="median" {...sortProps} />
                <SortableTh label="Ceiling" sortKey="ceiling" {...sortProps} />
                <th>Range</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const hasStats = row.stat_ranges && Object.keys(row.stat_ranges).length > 0;
                const isExpanded = hasStats && expanded === row.player_name;
                return (
                <Fragment key={row.player_name}>
                <tr data-pos={row.position}>
                  <td className="player-cell">
                    {hasStats ? (
                      <button
                        type="button"
                        className="player-expand-trigger"
                        onClick={() => setExpanded(isExpanded ? null : row.player_name)}
                        aria-expanded={isExpanded}
                      >
                        <TrendTag trend={row.trend} /> {row.player_name}{" "}
                        <ConfidenceBadge confidence={row.sample_confidence} />
                        <span className="expand-chevron">{isExpanded ? "▲" : "▼"}</span>
                      </button>
                    ) : (
                      <>
                        <TrendTag trend={row.trend} /> {row.player_name}{" "}
                        <ConfidenceBadge confidence={row.sample_confidence} />
                      </>
                    )}
                  </td>
                  <td className="mono align-left">{row.position}</td>
                  <td className="mono align-left">
                    <TeamBadge team={row.team} />
                  </td>
                  <td className="mono">{row.floor.toFixed(1)}</td>
                  <td className="mono heat-cell" style={{ "--heat": row.heat || 0 }}>
                    <strong>{row.median.toFixed(1)}</strong>
                  </td>
                  <td className="mono">{row.ceiling.toFixed(1)}</td>
                  <td>
                    <div className="sim-bar-track">
                      <div
                        className="sim-bar-typical"
                        style={{
                          left: `${(row.floor / maxCeiling) * 100}%`,
                          width: `${((row.median - row.floor) / maxCeiling) * 100}%`,
                        }}
                      ></div>
                      <div
                        className="sim-bar-upside"
                        style={{
                          left: `${(row.median / maxCeiling) * 100}%`,
                          width: `${((row.ceiling - row.median) / maxCeiling) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </td>
                </tr>
                {isExpanded && <StatDetailRow row={row} colSpan={7} />}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
