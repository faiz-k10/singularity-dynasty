"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import ConfidenceBadge from "./ConfidenceBadge";
import TeamBadge from "./TeamBadge";
import STAT_LABELS from "./statLabels";
import OutcomeCurve from "./OutcomeCurve";
import PositionPercentile from "./PositionPercentile";
import StatRadar from "./StatRadar";

// Per-position vertex order for the radar, chosen so a fixed clockwise-
// from-top layout (see StatRadar's angleFor) lands specific stats on
// specific vertices: QB/RB pentagons put their 3 "top" stats at indices
// 0/1/4 (top, upper-right, upper-left) and their 2 "bottom" stats at
// indices 2/3 (lower-right, lower-left); WR/TE triangles are flipped
// point-down via RADAR_START_DEG so index 0 lands at the bottom instead.
const RADAR_ORDER = {
  QB: ["passing_yards", "passing_tds", "rushing_yards", "rushing_tds", "passing_interceptions"],
  RB: ["receiving_yards", "receiving_tds", "rushing_yards", "rushing_tds", "receptions"],
  WR: ["receiving_tds", "receiving_yards", "receptions"],
  TE: ["receiving_tds", "receiving_yards", "receptions"],
};
const RADAR_START_DEG = { WR: 90, TE: 90 };

function radarLayoutFor(entries, position) {
  const order = RADAR_ORDER[position];
  if (!order) return { entries, startDeg: -90 };
  const byKey = new Map(entries.map((entry) => [entry[0], entry]));
  const ordered = order.map((key) => byKey.get(key)).filter(Boolean);
  const leftover = entries.filter(([key]) => !order.includes(key));
  return { entries: [...ordered, ...leftover], startDeg: RADAR_START_DEG[position] ?? -90 };
}

// Detail row unfolded below a player when their name is clicked -- one
// open at a time (clicking a different player folds this one and opens
// theirs). colSpan must match the number of columns in the main row.
function StatDetailRow({ row, colSpan, positionPeers }) {
  const ranges = row.stat_ranges;
  const entries = STAT_LABELS.filter(([key]) => ranges && ranges[key]);
  // Clicking a stat row drives the odds curve beside the table -- defaults
  // to the first available stat so the curve is never empty on open.
  const [selectedKey, setSelectedKey] = useState(entries[0]?.[0]);
  const selectedEntry = entries.find(([key]) => key === selectedKey) || entries[0];
  const radarEntriesRaw = entries.map(([key, label]) => [key, label, row.statPercentiles?.[key]]);
  const { entries: radarEntries, startDeg: radarStartDeg } = radarLayoutFor(radarEntriesRaw, row.position);

  if (entries.length === 0) return null;

  return (
    <tr className="stat-detail-row">
      <td colSpan={colSpan}>
        <div className="stat-detail-grid">
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
          <StatRadar entries={radarEntries} selectedKey={selectedKey} startDeg={radarStartDeg} />
          <PositionPercentile
            playerName={row.player_name}
            position={row.position}
            poolSize={row.positionPoolSize}
            floorPctile={row.floorPctile}
            medianPctile={row.medianPctile}
            ceilingPctile={row.ceilingPctile}
            peers={positionPeers}
          />
        </div>
      </td>
    </tr>
  );
}

// Floor/median/ceiling arrive as season totals -- Per Game divides by
// gamesPerSeason for display only. Sorting, heat-tint, and the Range bar
// all stay driven by the season totals underneath regardless of which
// unit is showing, since scaling every value by the same constant
// doesn't change relative order or ratios.
function formatStat(value, unit, gamesPerSeason) {
  if (unit === "season") return String(Math.round(value));
  return (value / gamesPerSeason).toFixed(1);
}

// Same pattern as RankingsSearch (Redraft) / BestBallSearch: position-pill
// filter + player name search, both client-side. Sorting stays
// server-driven via the existing URL-param mechanism.
export default function PlayerSimSearch({ rows, sortKey, sortDir, currentParams, positions, maxCeiling, gamesPerSeason, positionPeers }) {
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [selected, setSelected] = useState(positions || []);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set()); // player_names currently unfolded
  const [unit, setUnit] = useState("pergame");
  const sortProps = { activeSort: sortKey, activeDir: sortDir, currentParams };

  function toggle(pos) {
    setSelected((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  }

  function toggleExpanded(name) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
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
      <div className="unit-toggle-row">
        <div className="unit-toggle" role="group" aria-label="Display unit">
          <button
            type="button"
            className={unit === "pergame" ? "active" : ""}
            onClick={() => setUnit("pergame")}
            aria-pressed={unit === "pergame"}
          >
            Per Game
          </button>
          <button
            type="button"
            className={unit === "season" ? "active" : ""}
            onClick={() => setUnit("season")}
            aria-pressed={unit === "season"}
          >
            Season
          </button>
        </div>
      </div>

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

      <div className="compare-link-row">
        <Link href="/tools/compare-player-sims" className="hub-panel-link">
          Player Comparison →
        </Link>
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
                const isExpanded = hasStats && expanded.has(row.player_name);
                return (
                <Fragment key={row.player_name}>
                <tr
                  data-pos={row.position}
                  className={hasStats ? "row-expandable" : undefined}
                  onClick={hasStats ? () => toggleExpanded(row.player_name) : undefined}
                  role={hasStats ? "button" : undefined}
                  tabIndex={hasStats ? 0 : undefined}
                  aria-expanded={hasStats ? isExpanded : undefined}
                  onKeyDown={
                    hasStats
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpanded(row.player_name);
                          }
                        }
                      : undefined
                  }
                >
                  <td className="player-cell">
                    <TrendTag trend={row.trend} /> {row.player_name}{" "}
                    <ConfidenceBadge confidence={row.sample_confidence} />
                  </td>
                  <td className="mono align-left">
                    {row.position}
                    {row.positionRank != null && (
                      <span className="pos-rank">{row.positionRank}</span>
                    )}
                  </td>
                  <td className="mono align-left">
                    <TeamBadge team={row.team} />
                  </td>
                  <td className="mono">{formatStat(row.floor, unit, gamesPerSeason)}</td>
                  <td className="mono heat-cell" style={{ "--heat": row.heat || 0 }}>
                    <strong>{formatStat(row.median, unit, gamesPerSeason)}</strong>
                  </td>
                  <td className="mono">{formatStat(row.ceiling, unit, gamesPerSeason)}</td>
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
                {isExpanded && (
                  <StatDetailRow
                    row={row}
                    colSpan={7}
                    positionPeers={positionPeers?.[row.position]}
                  />
                )}
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
