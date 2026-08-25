"use client";

import { useEffect, useMemo, useState } from "react";
import RankingsSearch from "../RankingsSearch";
import ScoringSettingsPanel from "../ScoringSettingsPanel";
import { sortRows } from "@/lib/sortLink";
import { DEFAULT_SCORING_SETTINGS, computeCustomProjection, isDefaultScoring } from "@/lib/scoring";

const STORAGE_KEY = "sd-redraft-scoring-settings";

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
  notes: "string",
  ...Object.fromEntries(STAT_COLUMN_KEYS.map((k) => [k, "number"])),
};

// Wraps RankingsSearch with a custom scoring settings panel. `rawRows`
// arrive from the server already in natural (DB rank) order, each
// carrying `scoring_stats` (raw weekly component production) alongside
// the fixed-scoring `projection`. At default settings this renders
// byte-for-byte what the server computed -- rank/positionLabel/heat are
// only ever recalculated once a visitor actually changes a setting, so
// nobody who ignores the panel sees any different number than before.
export default function RedraftRankingsClient({ rawRows, sortKey, sortDir, currentParams, positions, header }) {
  const [settings, setSettings] = useState(DEFAULT_SCORING_SETTINGS);
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [selectedPositions, setSelectedPositions] = useState(positions || []);
  // Collapsed by default regardless of whether a non-default selection is
  // already active -- the always-visible value text next to the chevron
  // is what surfaces that without needing to open anything, same as
  // every other row in this accordion.
  const [positionOpen, setPositionOpen] = useState(false);

  function togglePosition(pos) {
    setSelectedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSettings({ ...DEFAULT_SCORING_SETTINGS, ...JSON.parse(saved) });
    } catch {
      // ignore malformed/blocked storage, just keep defaults
    }
  }, []);

  function updateSettings(next) {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage write failures (private browsing, quota, etc.)
    }
  }

  const usingDefault = isDefaultScoring(settings);

  const rows = useMemo(() => {
    // Recompute a player's projection only when a setting that actually
    // affects THEM changed -- PPR changes every position's reception
    // rate, but TE Premium only ever touches TEs (see lib/scoring.js).
    // Recomputing everyone the instant ANY setting differs from default
    // silently swapped every non-affected player's real median-based
    // `projection` for the cruder sum-of-mean-components approximation
    // (see computeCustomProjection's own comment on why those two
    // numbers structurally differ) -- e.g. toggling TE Premium alone
    // would reshuffle RBs/WRs against each other for no reason tied to
    // what was actually changed, since one side kept its accurate
    // number and the other didn't.
    const withProjection = rawRows.map((r) => {
      const affectsThisPlayer =
        settings.ppr !== DEFAULT_SCORING_SETTINGS.ppr ||
        (r.position === "TE" && settings.tePremium !== DEFAULT_SCORING_SETTINGS.tePremium);
      if (!affectsThisPlayer) return r;
      const custom = computeCustomProjection(r.scoring_stats, r.position, settings);
      return { ...r, projection: custom == null ? r.projection : custom };
    });

    // Re-derive rank/positionLabel/heat from custom-projection order --
    // same logic page.js uses for the default view, just recomputed
    // client-side so a changed scoring format can genuinely reorder
    // players (e.g. standard-scoring favors volume rushers over
    // pass-catching specialists).
    const ordered = usingDefault
      ? withProjection
      : [...withProjection].sort((a, b) => b.projection - a.projection);

    const positionCounters = {};
    const withLabels = ordered.map((r, i) => {
      positionCounters[r.position] = (positionCounters[r.position] || 0) + 1;
      return usingDefault
        ? r
        : { ...r, rank: i + 1, displayRank: i + 1, positionLabel: `${r.position}${positionCounters[r.position]}` };
    });

    const projRangeByPos = {};
    for (const r of withLabels) {
      const range = projRangeByPos[r.position] || { min: Infinity, max: -Infinity };
      range.min = Math.min(range.min, r.projection);
      range.max = Math.max(range.max, r.projection);
      projRangeByPos[r.position] = range;
    }
    const withHeat = withLabels.map((r) => {
      const range = projRangeByPos[r.position];
      const heat = range && range.max > range.min ? (r.projection - range.min) / (range.max - range.min) : 0;
      return { ...r, heat };
    });

    return sortRows(withHeat, sortKey, sortDir, COLUMN_TYPES);
  }, [rawRows, settings, usingDefault, sortKey, sortDir]);

  return (
    <RankingsSearch
      rows={rows}
      sortKey={sortKey}
      sortDir={sortDir}
      currentParams={currentParams}
      positions={positions}
      selected={selectedPositions}
      tableClassName="redraft-table"
      showStatColumns
      header={header}
      rightExtra={
        <ScoringSettingsPanel
          settings={settings}
          onChange={updateSettings}
          isDefault={usingDefault}
          onReset={() => updateSettings(DEFAULT_SCORING_SETTINGS)}
        >
          {showPositionFilter && (
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
          )}
        </ScoringSettingsPanel>
      }
    />
  );
}
