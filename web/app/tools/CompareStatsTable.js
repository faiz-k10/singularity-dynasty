"use client";

import { useState } from "react";
import TrendTag from "./TrendTag";
import ConfidenceBadge from "./ConfidenceBadge";
import TeamBadge from "./TeamBadge";

// Floor/median/ceiling arrive as season totals -- same convention and same
// helper as PlayerSimSearch.js's Per Game / Season toggle.
function formatStat(value, unit, gamesPerSeason) {
  if (unit === "season") return String(Math.round(value));
  return (value / gamesPerSeason).toFixed(1);
}

// Mirrors Player Season Simulations' own table: trend tag + confidence
// badge per player, the Per Game / Season toggle, position-relative
// heat-tint on Median, and the floor-median-ceiling Range bar. Per-stat
// breakdown rows and Notes stay season totals and untoggled, matching
// that table's dropdown exactly (never converted there either).
export default function CompareStatsTable({ selected, compareStats, maxCeiling, gamesPerSeason }) {
  const [unit, setUnit] = useState("pergame");

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

      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th></th>
              {selected.map((r) => (
                <th key={r.player_name}>
                  <TrendTag trend={r.trend} /> {r.player_name} <ConfidenceBadge confidence={r.sample_confidence} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Position</th>
              {selected.map((r) => (
                <td className="mono" key={r.player_name}>
                  {r.positionLabel || r.position}
                </td>
              ))}
            </tr>
            <tr>
              <th>Team</th>
              {selected.map((r) => (
                <td className="mono" key={r.player_name}>
                  <TeamBadge team={r.team} />
                </td>
              ))}
            </tr>
            <tr>
              <th>Floor</th>
              {selected.map((r) => (
                <td className="mono" key={r.player_name}>
                  {formatStat(r.floor, unit, gamesPerSeason)}
                </td>
              ))}
            </tr>
            <tr>
              <th>Median</th>
              {selected.map((r) => (
                <td className="mono heat-cell" style={{ "--heat": r.heat || 0 }} key={r.player_name}>
                  <strong>{formatStat(r.median, unit, gamesPerSeason)}</strong>
                </td>
              ))}
            </tr>
            <tr>
              <th>Ceiling</th>
              {selected.map((r) => (
                <td className="mono" key={r.player_name}>
                  {formatStat(r.ceiling, unit, gamesPerSeason)}
                </td>
              ))}
            </tr>
            <tr>
              <th>Range</th>
              {selected.map((r) => (
                <td key={r.player_name}>
                  <div className="sim-bar-track">
                    <div
                      className="sim-bar-typical"
                      style={{
                        left: `${(r.floor / maxCeiling) * 100}%`,
                        width: `${((r.median - r.floor) / maxCeiling) * 100}%`,
                      }}
                    ></div>
                    <div
                      className="sim-bar-upside"
                      style={{
                        left: `${(r.median / maxCeiling) * 100}%`,
                        width: `${((r.ceiling - r.median) / maxCeiling) * 100}%`,
                      }}
                    ></div>
                  </div>
                </td>
              ))}
            </tr>
            {compareStats.map(([key, label]) => (
              <tr key={key}>
                <th>{label}</th>
                {selected.map((r) => {
                  const v = r.stat_ranges && r.stat_ranges[key];
                  return (
                    <td className="mono" key={r.player_name}>
                      {v ? `${v.floor}–${v.median}–${v.ceiling}` : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th>Notes</th>
              {selected.map((r) => (
                <td className="tool-notes" key={r.player_name}>
                  {r.notes || ""}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
