"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { sortRows } from "@/lib/sortLink";
import SortableTh from "./SortableTh";
import TrendTag from "./TrendTag";
import ConfidenceBadge from "./ConfidenceBadge";
import TeamBadge from "./TeamBadge";
import STAT_LABELS from "./statLabels";
import StatRadar from "./StatRadar";
import SimilarShapeFinder from "./SimilarShapeFinder";
import PercentileCard from "./PercentileCard";
import { radarLayoutFor } from "./radarLayout";

// Detail row unfolded below a player when their name is clicked -- one
// open at a time (clicking a different player folds this one and opens
// theirs). colSpan must match the number of columns in the main row.
function StatDetailRow({ row, colSpan, shapePeers }) {
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

// POR/WOPR/EPA are the tierable metrics -- floor/median/ceiling tiering
// was removed by request. Tiers only read as a contiguous block when the
// table is actually sorted by the same metric they're grouped by, so
// "Tier by" drives the real sort too. It used to do that through a Link
// to a new ?sort= URL, round-tripping through the server component to
// re-query Supabase and recompute everything just to reorder rows the
// client already has; it's now a client-side override (clientSort
// below) that re-sorts the already-loaded rows in the browser, instant,
// and falls back to the server-provided sortKey/sortDir whenever no
// override is set, so real column-header clicks (SortableTh) are
// unaffected.
const TIER_COLUMN_TYPES = { por: "number", wopr: "number", epa: "number" };
// POR's tier field is just `tier` (legacy name); WOPR/EPA are `woprTier`/
// `epaTier` (computed globally, same as POR -- see lib/tiers.js) -- this
// maps a tier-by sort key to the row field that actually holds its tier
// number.
const TIER_FIELD_BY_KEY = { por: "tier", wopr: "woprTier", epa: "epaTier" };

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
export default function PlayerSimSearch({ rows, sortKey, sortDir, currentParams, positions, maxCeiling, shapePeers, leagueTeams, superflex }) {
  const showPositionFilter = Array.isArray(positions) && positions.length > 0;
  const [selected, setSelected] = useState(positions || []);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set()); // player_names currently unfolded
  // null = defer to the server-provided sortKey/sortDir (URL-driven column
  // sort); set once a "Tier by" button is clicked, instant client-side.
  const [clientSort, setClientSort] = useState(null);
  const effectiveSortKey = clientSort?.key ?? sortKey;
  const effectiveSortDir = clientSort?.dir ?? sortDir;
  const tierField = TIER_FIELD_BY_KEY[effectiveSortKey];
  const bannersEnabled = tierField != null;
  const sortProps = { activeSort: effectiveSortKey, activeDir: effectiveSortDir, currentParams };

  function selectTierBy(key) {
    setClientSort({ key, dir: "desc" });
  }

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

  const displayRows = useMemo(() => {
    if (!clientSort) return filteredRows;
    return sortRows(filteredRows, clientSort.key, clientSort.dir, TIER_COLUMN_TYPES);
  }, [filteredRows, clientSort]);

  return (
    <>
      <div className="compare-link-row">
        <Link href="/tools/compare-player-sims" className="hub-panel-link">
          Player Comparison →
        </Link>
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

      <div className="tier-toggle-row">
        <span className="tier-toggle-label">Tiers</span>
        <div className="tier-toggle">
          <button type="button" onClick={() => selectTierBy("por")} className={effectiveSortKey === "por" ? "active" : ""} aria-pressed={effectiveSortKey === "por"}>
            POR
          </button>
          <button type="button" onClick={() => selectTierBy("wopr")} className={effectiveSortKey === "wopr" ? "active" : ""} aria-pressed={effectiveSortKey === "wopr"}>
            WOPR
          </button>
          <button type="button" onClick={() => selectTierBy("epa")} className={effectiveSortKey === "epa" ? "active" : ""} aria-pressed={effectiveSortKey === "epa"}>
            EPA
          </button>
        </div>
      </div>

      <div className="tier-toggle-row">
        <span className="tier-toggle-label" title="Changes POR's replacement-level baseline">League Size</span>
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
      </div>

      <div className="tier-toggle-row">
        <span className="tier-toggle-label" title="Changes POR's replacement-level baseline">QB Format</span>
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
                <th className="row-num-th">#</th>
                <SortableTh label="Player" sortKey="player_name" {...sortProps} />
                <SortableTh label="Pos" sortKey="position" {...sortProps} />
                <SortableTh label="Team" sortKey="team" {...sortProps} />
                <SortableTh label="Floor" sortKey="floor" {...sortProps} />
                <SortableTh label="Median" sortKey="median" {...sortProps} />
                <SortableTh label="Ceiling" sortKey="ceiling" {...sortProps} />
                <th>Range</th>
                <SortableTh
                  label="POR"
                  sortKey="por"
                  title={`Points over Replacement — composite floor/median/ceiling score vs. the replacement-level baseline at this position (${leagueTeams}-team, ${superflex ? "Superflex" : "1QB"})`}
                  {...sortProps}
                />
                <SortableTh
                  label="WOPR"
                  sortKey="wopr"
                  title="Weighted Opportunity Rating — 1.5×target share + 0.7×air yards share. Receiving usage only; not applicable to QB."
                  {...sortProps}
                />
                <SortableTh
                  label="EPA"
                  sortKey="epa"
                  title="Expected Points Added per game — passing EPA (QB), rushing+receiving EPA (RB), receiving EPA (WR/TE)."
                  {...sortProps}
                />
                <SortableTh
                  label="Regr"
                  sortKey="regressionScore"
                  title="In-season regression score — real points scored so far minus the projected pace for that many games. Positive: ahead of pace, expect cooldown. Negative: behind pace, expect warm-up. Blank until real games are played."
                  {...sortProps}
                />
                <SortableTh
                  label="Pace %ile"
                  sortKey="outcomePercentile"
                  title="If the player kept up their current pace for a full season, where that lands on their own floor(10th)–median(50th)–ceiling(90th) outcome curve. Blank until real games are played."
                  {...sortProps}
                />
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Banner spans the full table width and drops in right
                // above the first row of each new tier. POR/WOPR/EPA
                // tiers are all computed globally (lib/tiers.js), so a
                // single running lastTier is enough and the banner has
                // no position prefix -- a tier can and should span
                // multiple positions.
                let lastTier = null;
                return displayRows.map((row, index) => {
                  const hasStats = row.stat_ranges && Object.keys(row.stat_ranges).length > 0;
                  const isExpanded = hasStats && expanded.has(row.player_name);
                  const tier = bannersEnabled ? row[tierField] : null;
                  const showTierBanner = tier != null && lastTier !== tier;
                  if (tier != null) lastTier = tier;
                  return (
                <Fragment key={row.player_name}>
                {showTierBanner && (
                  <tr className="tier-banner-row" aria-hidden="true">
                    <td colSpan={13}>
                      <span className="tier-banner-label">Tier {tier}</span>
                    </td>
                  </tr>
                )}
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
                  <td className="mono align-left row-num-cell">{index + 1}</td>
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
                    </div>
                  </td>
                  <td className={`mono por-cell ${row.por >= 0 ? "por-positive" : "por-negative"}`}>
                    {row.por >= 0 ? "+" : ""}
                    {row.por.toFixed(1)}
                  </td>
                  <td className="mono align-left">
                    {row.wopr != null ? row.wopr.toFixed(3) : "—"}
                  </td>
                  <td className={`mono align-left ${row.epa != null ? (row.epa >= 0 ? "por-positive" : "por-negative") : ""}`}>
                    {row.epa != null ? `${row.epa >= 0 ? "+" : ""}${row.epa.toFixed(2)}` : "—"}
                  </td>
                  <td
                    className={`mono align-left ${row.regressionScore != null ? (row.regressionScore >= 0 ? "por-positive" : "por-negative") : ""}`}
                    title={
                      row.regressionScore != null
                        ? `${row.gamesPlayed} game${row.gamesPlayed === 1 ? "" : "s"} played, ${row.currentPPG.toFixed(1)} PPG so far`
                        : "No games played yet this season"
                    }
                  >
                    {row.regressionScore != null
                      ? `${row.regressionScore >= 0 ? "+" : ""}${row.regressionScore.toFixed(2)}`
                      : "—"}
                  </td>
                  <td
                    className="mono align-left"
                    title={
                      row.outcomePercentile != null
                        ? `Current pace of ${row.currentPPG.toFixed(1)} PPG, extrapolated over a full season, is ${ordinal(row.outcomePercentile)} percentile on this player's own outcome curve`
                        : "No games played yet this season"
                    }
                  >
                    {row.outcomePercentile != null ? ordinal(row.outcomePercentile) : "—"}
                  </td>
                </tr>
                {isExpanded && (
                  <StatDetailRow
                    row={row}
                    colSpan={13}
                    shapePeers={shapePeers}
                  />
                )}
                </Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
