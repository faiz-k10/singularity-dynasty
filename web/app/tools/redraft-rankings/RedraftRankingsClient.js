"use client";

import { useEffect, useMemo, useState } from "react";
import RankingsSearch from "../RankingsSearch";
import ScoringSettingsPanel from "../ScoringSettingsPanel";
import { sortRows } from "@/lib/sortLink";
import { DEFAULT_SCORING_SETTINGS, computeCustomProjection, isDefaultScoring } from "@/lib/scoring";

const STORAGE_KEY = "sd-redraft-scoring-settings";

const COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  opponent: "string",
  projection: "number",
};

// Wraps RankingsSearch with a custom scoring settings panel. `rawRows`
// arrive from the server already in natural (DB rank) order, each
// carrying `scoring_stats` (raw weekly component production) alongside
// the fixed-scoring `projection`. At default settings this renders
// byte-for-byte what the server computed -- rank/positionLabel/heat are
// only ever recalculated once a visitor actually changes a setting, so
// nobody who ignores the panel sees any different number than before.
export default function RedraftRankingsClient({ rawRows, sortKey, sortDir, currentParams, positions }) {
  const [settings, setSettings] = useState(DEFAULT_SCORING_SETTINGS);

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
    const withProjection = rawRows.map((r) => {
      if (usingDefault) return r;
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
    <>
      <ScoringSettingsPanel
        settings={settings}
        onChange={updateSettings}
        isDefault={usingDefault}
        onReset={() => updateSettings(DEFAULT_SCORING_SETTINGS)}
      />
      <RankingsSearch
        rows={rows}
        sortKey={sortKey}
        sortDir={sortDir}
        currentParams={currentParams}
        positions={positions}
      />
    </>
  );
}
