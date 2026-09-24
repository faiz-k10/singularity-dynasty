"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import TeamBadge from "./TeamBadge";
import STAT_LABELS from "./statLabels";
import StatRadar from "./StatRadar";
import SimilarShapeFinder from "./SimilarShapeFinder";
import PercentileCard from "./PercentileCard";
import { radarLayoutFor } from "./radarLayout";

// Detail row unfolded below a player when their name is clicked -- one
// open at a time (clicking a different player folds this one and opens
// theirs). colSpan must match the number of columns in the main row.
function StatDetailRow({ row, colSpan, shapePeers, maxCeiling }) {
  const ranges = row.stat_ranges;
  const entries = STAT_LABELS.filter(([key]) => ranges && ranges[key]);
  // One selection at a time, in one of three modes, so a new click always
  // fully replaces whatever was highlighted before instead of stacking on
  // top of it (two separate key/layer state vars used to let a stale key
  // from one click linger alongside a fresh layer from the next):
  //   "row"    -- clicked a stat name -- highlights all 3 of its numbers
  //               and all 3 of its markers on the radar, none emphasized
  //               over the others.
  //   "column" -- clicked a Floor/Median/Ceiling header -- highlights that
  //               number in every row, and that layer's marker on every
  //               radar vertex (floor/ceiling markers are otherwise
  //               hidden, so this is what makes them visible at all).
  //   "cell"   -- clicked one specific number -- highlights only that
  //               number and only its one radar marker, nothing else.
  const [selection, setSelection] = useState(null);
  function selectRow(key) {
    setSelection({ mode: "row", key, layer: null });
  }
  function selectColumn(layer) {
    setSelection({ mode: "column", key: null, layer });
  }
  function selectCell(key, layer) {
    setSelection({ mode: "cell", key, layer });
  }
  // Which "most similar shape" comp (if any) is overlaid on the radar --
  // a name rather than the row object since it's looked up fresh from
  // shapePool below. compareLayer is which of that comp's Floor/Median/
  // Ceiling is showing; selecting a comp defaults to its median, but each
  // row in SimilarShapeFinder carries its own F/M/C picker to switch it.
  const [compareName, setCompareName] = useState(null);
  const [compareLayer, setCompareLayer] = useState("median");
  function selectCompare(name, layer) {
    if (compareName === name && compareLayer === layer) {
      setCompareName(null);
    } else {
      setCompareName(name);
      setCompareLayer(layer);
    }
  }
  const radarEntriesRaw = entries.map(([key, label]) => [
    key,
    label,
    row.statPercentiles?.[key],
    row.statFloorPercentiles?.[key],
    row.statCeilingPercentiles?.[key],
  ]);
  const { entries: radarEntries, startDeg: radarStartDeg } = radarLayoutFor(radarEntriesRaw, row.position);
  // Table-order (not radar-vertex-order) percentile lookup for the card
  // under the table -- same three percentiles the radar already plots,
  // just spelled out as numbers instead of shape. Raw floor/median/
  // ceiling values ride along too, so the card can show the actual stat
  // next to its percentile instead of the percentile alone.
  const percentileStats = entries.map(([key, label]) => ({
    key,
    label,
    floorPctile: row.statFloorPercentiles?.[key],
    medianPctile: row.statPercentiles?.[key],
    ceilingPctile: row.statCeilingPercentiles?.[key],
    floorValue: ranges[key]?.floor,
    medianValue: ranges[key]?.median,
    ceilingValue: ranges[key]?.ceiling,
  }));

  const shapeSignature = entries.map(([key]) => key).sort().join("|");
  const shapePool = shapePeers?.[shapeSignature];
  const compareRow = compareName ? shapePool?.find((p) => p.name === compareName) : null;
  const comparePctiles =
    compareLayer === "floor"
      ? compareRow?.statFloorPercentiles
      : compareLayer === "ceiling"
      ? compareRow?.statCeilingPercentiles
      : compareRow?.statPercentiles;
  const compareEntries = compareRow
    ? radarEntries.map(([key, label]) => [key, label, comparePctiles?.[key]])
    : null;

  if (entries.length === 0) return null;

  return (
    <tr className="stat-detail-row">
      <td colSpan={colSpan}>
        <div className="stat-detail-grid">
          {/* Actual points scored so far this season + vs Pace, spelled
              out in the same units and color language (--up/--down) as
              the Range bar's own pace-marker-hot/cold tick and the main
              row's vs Pace/Pace %ile columns -- just with the raw
              actual-points total those columns don't otherwise show.
              Top-left of the dashboard, its own grid area (not stacked
              beside the radar anymore) -- explicit ask, along with the
              portrait now stacked above the label. Omitted entirely (not
              a placeholder) when there's no player_actual_production data
              yet for this player, same null-handling every other
              nullable metric on this page already uses. */}
          {row.gamesPlayed > 0 && row.currentPPG != null && row.regressionScore != null && (
            <div className="stat-panel stat-panel-pace">
              <div className="stat-panel-pace-top">
                <div className="stat-panel-pace-info">
                  {row.sleeperId && (
                    <img
                      className="stat-panel-pace-portrait"
                      src={`https://sleepercdn.com/content/nfl/players/thumb/${row.sleeperId}.jpg`}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <div className="stat-panel-pace-header">
                    <span className="stat-panel-pace-name">{row.player_name}</span>
                    <span className="stat-panel-pace-pos mono">{row.position}</span>
                  </div>
                  <div className="stat-panel-pace-actual">
                    {(row.currentPPG * row.gamesPlayed).toFixed(1)}
                    <span className="stat-panel-pace-games">
                      {" "}
                      pts · {row.gamesPlayed} {row.gamesPlayed === 1 ? "game" : "games"}
                    </span>
                  </div>
                  <div className={`stat-panel-pace-delta ${row.regressionScore >= 0 ? "pace-hot" : "pace-cold"}`}>
                    {row.regressionScore >= 0 ? "+" : ""}
                    {row.regressionScore.toFixed(2)} vs. pace
                  </div>
                  {row.outcomePercentile != null && (
                    <div className="stat-panel-pace-pctile">{ordinal(row.outcomePercentile)} percentile pace</div>
                  )}
                </div>
                {/* Vertical mirror of the main table's own horizontal Range
                    bar (same maxCeiling scale, same floor/median/ceiling
                    segments and pace-marker-hot/cold tick) -- the season
                    panel's floor/ceiling projection wasn't shown anywhere
                    on it before, and the bar gives the actual-pts-so-far
                    number above real context (on pace for where inside its
                    own projected range) instead of standing alone. The
                    paceSeasonTotal number rides alongside the tick itself
                    (same hot/cold color) so the projected full-season total
                    implied by the current pace is readable at a glance,
                    not just its position on the bar. */}
                {row.floor != null && row.median != null && row.ceiling != null && maxCeiling > 0 && (
                  <div className="stat-panel-pace-rangebar-wrap">
                    <div className="stat-panel-pace-rangebar">
                      <div
                        className="stat-panel-pace-rangebar-typical"
                        style={{
                          bottom: `${(row.floor / maxCeiling) * 100}%`,
                          height: `${((row.median - row.floor) / maxCeiling) * 100}%`,
                        }}
                      />
                      <div
                        className="stat-panel-pace-rangebar-upside"
                        style={{
                          bottom: `${(row.median / maxCeiling) * 100}%`,
                          height: `${((row.ceiling - row.median) / maxCeiling) * 100}%`,
                        }}
                      />
                      {/* Floor/ceiling numbers pinned to the colored
                          segment's own top and bottom edge (same bottom%
                          math as the segments themselves), not to the
                          track's container edges -- the track spans the
                          full 0-maxCeiling scale so the pace marker below
                          has room to sit above the segment, and labels at
                          the container edges used to read as "top/bottom
                          of the whole bar" when they actually meant
                          "top/bottom of this player's own range." */}
                      <span
                        className="stat-panel-pace-rangebar-label stat-panel-pace-rangebar-label-ceiling"
                        style={{ bottom: `${(row.ceiling / maxCeiling) * 100}%` }}
                      >
                        {formatStat(row.ceiling)}
                      </span>
                      <span
                        className="stat-panel-pace-rangebar-label stat-panel-pace-rangebar-label-floor"
                        style={{ bottom: `${(row.floor / maxCeiling) * 100}%` }}
                      >
                        {formatStat(row.floor)}
                      </span>
                      {row.paceSeasonTotal != null && (
                        <>
                          <div
                            className={`stat-panel-pace-rangebar-marker ${row.outcomePercentile >= 50 ? "pace-marker-hot" : "pace-marker-cold"}`}
                            style={{ bottom: `${Math.min(100, (row.paceSeasonTotal / maxCeiling) * 100)}%` }}
                            title={`Current pace: ${ordinal(row.outcomePercentile)} percentile on this player's outcome curve`}
                          />
                          <div
                            className={`stat-panel-pace-rangebar-total ${row.outcomePercentile >= 50 ? "pace-hot" : "pace-cold"}`}
                            style={{ bottom: `${Math.min(100, (row.paceSeasonTotal / maxCeiling) * 100)}%` }}
                          >
                            {formatStat(row.paceSeasonTotal)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Games-played-of-17 progress bar, pinned to the bottom of
                  the whole panel (its own row below the info/rangebar
                  split above) -- a second read on schedule progress
                  alongside the games count already in -pace-games. */}
              <div className="stat-panel-pace-progress">
                <div className="stat-panel-pace-progress-track">
                  <div
                    className="stat-panel-pace-progress-fill"
                    style={{ width: `${Math.min(100, (row.gamesPlayed / 17) * 100)}%` }}
                  />
                </div>
                <span className="stat-panel-pace-progress-label">{row.gamesPlayed}/17 games</span>
              </div>
            </div>
          )}
          <div className="stat-panel stat-panel-table">
            <table className="stat-detail-table">
              <thead>
                <tr>
                  <th>Stat</th>
                  {["floor", "median", "ceiling"].map((layer) => (
                    <th key={layer}>
                      <button
                        type="button"
                        className={`stat-header-trigger${selection?.mode === "column" && selection.layer === layer ? " stat-header-trigger-active" : ""}`}
                        onClick={() => selectColumn(layer)}
                        aria-pressed={selection?.mode === "column" && selection.layer === layer}
                      >
                        {layer === "floor" ? "Floor" : layer === "median" ? "Median" : "Ceiling"}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(([key, label]) => {
                  const { floor, median, ceiling } = ranges[key];
                  const isRowMode = selection?.mode === "row" && selection.key === key;
                  // A cell's own highlight only ever comes from one of the
                  // three modes at a time (whichever the current selection
                  // is in) -- no more separately-tracked row/column dims
                  // that could both apply after a stale click, which is
                  // what "column" clicking still highlighted the previous
                  // row's numbers too.
                  function cellProps(layer) {
                    const isCellActive = selection?.mode === "cell" && selection.key === key && selection.layer === layer;
                    const isColumnDim = selection?.mode === "column" && selection.layer === layer;
                    const isRowDim = isRowMode;
                    return {
                      className: `stat-row-trigger${
                        isCellActive ? " stat-row-trigger-active" : isColumnDim || isRowDim ? " stat-row-trigger-column" : ""
                      }`,
                      onClick: () => selectCell(key, layer),
                      "aria-pressed": isCellActive,
                    };
                  }
                  return (
                    <tr key={key} className={isRowMode ? "stat-row-selected" : ""}>
                      <td>
                        <button
                          type="button"
                          className={`stat-row-trigger${isRowMode ? " stat-row-trigger-active" : ""}`}
                          onClick={() => selectRow(key)}
                          aria-pressed={isRowMode}
                        >
                          {label}
                        </button>
                      </td>
                      <td className="mono">
                        <button type="button" {...cellProps("floor")}>
                          {floor}
                        </button>
                      </td>
                      <td className="mono">
                        <button type="button" {...cellProps("median")}>
                          <strong>{median}</strong>
                        </button>
                      </td>
                      <td className="mono">
                        <button type="button" {...cellProps("ceiling")}>
                          {ceiling}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="stat-panel stat-panel-percentile">
            <PercentileCard stats={percentileStats} position={row.position} selection={selection} onSelectCell={selectCell} />
          </div>
          <div className="stat-panel stat-panel-radar">
            <StatRadar
              entries={radarEntries}
              selection={selection}
              startDeg={radarStartDeg}
              compareEntries={compareEntries}
              onSelectKey={selectRow}
            />
          </div>
          <SimilarShapeFinder
            ownName={row.player_name}
            statPercentiles={row.statPercentiles}
            statFloorPercentiles={row.statFloorPercentiles}
            statCeilingPercentiles={row.statCeilingPercentiles}
            stats={percentileStats}
            keys={entries.map(([key]) => key)}
            peers={shapePool}
            selectedName={compareName}
            selectedLayer={compareLayer}
            onSelect={selectCompare}
            selection={selection}
          />
        </div>
      </td>
    </tr>
  );
}

function formatStat(value) {
  return String(Math.round(value));
}

function ordinal(n) {
  const rounded = Math.round(n);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rounded}th`;
  switch (rounded % 10) {
    case 1: return `${rounded}st`;
    case 2: return `${rounded}nd`;
    case 3: return `${rounded}rd`;
    default: return `${rounded}th`;
  }
}

// League Size / QB Format toggles change POR's replacement-level baseline
// (lib/replacementValue.js), which needs the full player pool -- including
// the extra rows a free/signed-out viewer's teaser response never
// contains -- to compute correctly. So unlike "Tier by" above, these stay
// real navigation (a Link to a new URL) rather than a client-side
// override: the server recomputes POR against the full pool every time.
function leagueHref(currentParams, key, value) {
  const params = new URLSearchParams(currentParams || {});
  params.set(key, value);
  return `?${params.toString()}`;
}

// Same pattern as RankingsSearch (Redraft) / BestBallSearch: position-pill
// filter + player name search, both client-side. Sorting stays
// server-driven via the existing URL-param mechanism.
export default function PlayerSimSearch({ rows, sortKey, sortDir, currentParams, positions, maxCeiling, shapePeers, leagueTeams, superflex, header }) {
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [selected, setSelected] = useState(positions || []);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set()); // player_names currently unfolded
  // Each filter row's LABEL always shows (plus its current value, so
  // it's legible at a glance) -- only the actual toggle buttons underneath
  // collapse, independently per row, accordion-style. Starts fully
  // collapsed regardless of whether a non-default value is already active
  // (via URL params); the always-visible current-value text is what
  // surfaces that without needing to open anything.
  const [openGroups, setOpenGroups] = useState({ position: false, league: false, qb: false });
  function toggleGroup(key) {
    setOpenGroups((g) => ({ ...g, [key]: !g[key] }));
  }
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

  const displayRows = filteredRows;

  const tableWrapRef = useRef(null);

  // Theater mode -- same full-screen overlay treatment as Weekly
  // Projection Rankings (RankingsTable.js): the table wrap goes
  // position:fixed edge-to-edge over the whole viewport instead of
  // sitting in its normal spot, reclaiming the width the filter
  // accordion/page margins cost. Body scroll is locked while active;
  // Escape closes it the same as the visible button does. The bar
  // carries its own copy of the search input and Position pills, wired
  // to the SAME query/selected state already owned above, since the
  // fixed overlay sits above the page's own copies of both.
  const [theater, setTheater] = useState(false);
  useEffect(() => {
    if (!theater) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") setTheater(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [theater]);

  return (
    <>
      <div className="tool-header-split">
      <div className="tool-header-left">
        {header}
        <div className="compare-link-row">
          <Link href="/tools/compare-player-sims" className="hub-panel-link">
            Player Comparison →
          </Link>
        </div>
      </div>
      <div className="tool-header-right">
      <div className="filter-accordion">
        {showPositionFilter && (
          <div className="filter-row">
            <button
              type="button"
              className="filter-row-header"
              onClick={() => toggleGroup("position")}
              aria-expanded={openGroups.position}
            >
              <span className={`filter-row-chevron${openGroups.position ? " filter-row-chevron-open" : ""}`}>▸</span>
              <span className="tier-toggle-label">Position</span>
              <span className={`filter-row-value${selected.length < positions.length ? " filter-row-value-active" : ""}`}>
                {selected.length === positions.length ? "All" : selected.length === 0 ? "None" : selected.join(", ")}
              </span>
            </button>
            {openGroups.position && (
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
          </div>
        )}

        <div className="filter-row">
          <button
            type="button"
            className="filter-row-header"
            onClick={() => toggleGroup("league")}
            aria-expanded={openGroups.league}
            title="Changes POR's replacement-level baseline"
          >
            <span className={`filter-row-chevron${openGroups.league ? " filter-row-chevron-open" : ""}`}>▸</span>
            <span className="tier-toggle-label">League Size</span>
            <span className={`filter-row-value${leagueTeams !== 12 ? " filter-row-value-active" : ""}`}>{leagueTeams}-Team</span>
          </button>
          {openGroups.league && (
            <div className="tier-toggle">
              <Link
                href={leagueHref(currentParams, "teams", "10")}
                className={leagueTeams === 10 ? "active" : ""}
                aria-pressed={leagueTeams === 10}
              >
                10-Team
              </Link>
              <Link
                href={leagueHref(currentParams, "teams", "12")}
                className={leagueTeams === 12 ? "active" : ""}
                aria-pressed={leagueTeams === 12}
              >
                12-Team
              </Link>
            </div>
          )}
        </div>

        <div className="filter-row">
          <button
            type="button"
            className="filter-row-header"
            onClick={() => toggleGroup("qb")}
            aria-expanded={openGroups.qb}
            title="Changes POR's replacement-level baseline"
          >
            <span className={`filter-row-chevron${openGroups.qb ? " filter-row-chevron-open" : ""}`}>▸</span>
            <span className="tier-toggle-label">QB Format</span>
            <span className={`filter-row-value${superflex ? " filter-row-value-active" : ""}`}>{superflex ? "Superflex" : "1QB"}</span>
          </button>
          {openGroups.qb && (
            <div className="tier-toggle">
              <Link
                href={leagueHref(currentParams, "qb", "1qb")}
                className={!superflex ? "active" : ""}
                aria-pressed={!superflex}
              >
                1QB
              </Link>
              <Link
                href={leagueHref(currentParams, "qb", "sf")}
                className={superflex ? "active" : ""}
                aria-pressed={superflex}
              >
                Superflex
              </Link>
            </div>
          )}
        </div>
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
      </div>
      </div>

      {showPositionFilter && selected.length === 0 ? (
        <div className="tool-empty">
          <p>Pick at least one position above.</p>
        </div>
      ) : (
        <>
          <div className={`rankings-theater-bar${theater ? " theater" : ""}`}>
            {theater && (
              <div className="rankings-theater-controls">
                <input
                  type="search"
                  className="player-search-input"
                  placeholder="Search a player's name…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search players"
                />
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
              </div>
            )}
            <button
              type="button"
              className="rankings-theater-btn"
              onClick={() => setTheater((v) => !v)}
              aria-label={theater ? "Exit full-screen view" : "Expand to full-screen view"}
              title={theater ? "Exit full-screen view" : "Expand to full-screen view"}
            >
              {theater ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M4 15h3a2 2 0 0 1 2 2v3M15 20v-3a2 2 0 0 1 2-2h3" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 4H6a2 2 0 0 0-2 2v3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M15 20h3a2 2 0 0 0 2-2v-3" />
                </svg>
              )}
            </button>
          </div>
          <div
            className={`rankings-table-wrap player-sims-table-wrap${theater ? " theater" : ""}`}
            ref={tableWrapRef}
          >
          <table className="rankings-table player-sims-table">
            <thead>
              <tr>
                <SortableTh label="Rank" sortKey="rank" {...sortProps} />
                <SortableTh label="Player" sortKey="player_name" {...sortProps} />
                <SortableTh label="Pos" sortKey="position" {...sortProps} />
                <SortableTh label="Team" sortKey="team" {...sortProps} />
                <SortableTh label="Floor" sortKey="floor" {...sortProps} />
                <SortableTh label="Median" sortKey="median" {...sortProps} />
                <SortableTh label="Ceiling" sortKey="ceiling" {...sortProps} />
                <th>Range</th>
                <SortableTh
                  label="vs Pace"
                  sortKey="regressionScore"
                  title="Total fantasy points scored so far this season vs. the pace their projection implied (actual − projected PPG × games played). Positive = running hot, expect to cool off toward projection; negative = running cold, expect to warm back up."
                  {...sortProps}
                />
                <SortableTh
                  label="Pace %ile"
                  sortKey="outcomePercentile"
                  {...sortProps}
                />
                <SortableTh
                  label="POR"
                  sortKey="por"
                  title={`Points over Replacement — composite floor/median/ceiling score vs. the replacement-level baseline at this position (${leagueTeams}-team, ${superflex ? "Superflex" : "1QB"})`}
                  {...sortProps}
                />
              </tr>
            </thead>
            <tbody>
              {(() => {
                return displayRows.map((row) => {
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
                  <td className="mono">{row.rank}</td>
                  <td className="player-cell">
                    <TrendTag trend={row.trend} /> {row.player_name}
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
                  <td className="mono heat-cell-alt" style={{ "--heat": row.floorHeat || 0 }}>
                    {formatStat(row.floor)}
                  </td>
                  <td className="mono heat-cell" style={{ "--heat": row.heat || 0 }}>
                    <strong>{formatStat(row.median)}</strong>
                  </td>
                  <td className="mono heat-cell-alt" style={{ "--heat": row.ceilingHeat || 0 }}>
                    {formatStat(row.ceiling)}
                  </td>
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
                      {row.paceSeasonTotal != null && (
                        <div
                          className={`pace-marker ${row.outcomePercentile >= 50 ? "pace-marker-hot" : "pace-marker-cold"}`}
                          style={{ left: `${Math.min(100, (row.paceSeasonTotal / maxCeiling) * 100)}%` }}
                          title={`Current pace: ${ordinal(row.outcomePercentile)} percentile on this player's outcome curve`}
                        ></div>
                      )}
                    </div>
                  </td>
                  <td
                    className={`mono align-left ${row.regressionScore != null ? (row.regressionScore >= 0 ? "por-positive" : "por-negative") : ""}`}
                  >
                    {row.regressionScore != null
                      ? `${row.regressionScore >= 0 ? "+" : ""}${row.regressionScore.toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="mono align-left">
                    {row.outcomePercentile != null ? ordinal(row.outcomePercentile) : "—"}
                  </td>
                  <td className={`mono por-cell ${row.por >= 0 ? "por-positive" : "por-negative"}`}>
                    {row.por >= 0 ? "+" : ""}
                    {row.por.toFixed(1)}
                  </td>
                </tr>
                {isExpanded && (
                  <StatDetailRow
                    row={row}
                    colSpan={11}
                    shapePeers={shapePeers}
                    maxCeiling={maxCeiling}
                  />
                )}
                </Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
          </div>
        </>
      )}
    </>
  );
}
