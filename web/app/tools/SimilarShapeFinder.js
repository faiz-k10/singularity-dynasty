"use client";

// Plain squared distance across whatever stat keys the two players share.
function shapeDistance(a, b, keys) {
  let sum = 0;
  for (const key of keys) {
    const d = (a[key] ?? 0) - (b[key] ?? 0);
    sum += d * d;
  }
  return sum;
}

const LAYERS = [
  { key: "floor", label: "F", name: "floor" },
  { key: "median", label: "M", name: "median" },
  { key: "ceiling", label: "C", name: "ceiling" },
];
const LAYER_LABEL = { floor: "Floor", median: "Median", ceiling: "Ceiling" };

// One row of the diverging bar: two ticks (this player's percentile and
// the comp's) on a shared 0-100 track, with the span between them filled
// green when the player leads and red when the comp does -- the same
// --up/--down pair TrendTag/the ticker already use, so "ahead" reads the
// same color language site-wide instead of introducing a new green/red.
// The +/-N number is the same comparison spelled out as a plain number
// for whoever doesn't want to read bar positions -- "pctl" rides along
// in dim text right on the number instead of a separate legend, so the
// unit is obvious in place without a key to cross-reference.
function CompareBar({ label, playerPctile, compPctile }) {
  if (playerPctile == null || compPctile == null) return null;
  const diff = Math.round(playerPctile) - Math.round(compPctile);
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "even";
  const lo = Math.min(playerPctile, compPctile);
  const hi = Math.max(playerPctile, compPctile);
  return (
    <div className="shape-compare-row">
      <span className="shape-compare-row-label">{label}</span>
      <div className="shape-compare-track">
        <div className={`shape-compare-fill shape-compare-fill-${dir}`} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        {/* 50th-percentile reference -- fixed at center regardless of
            either tick's position, so "ahead of/behind average" is a
            glance instead of a mental 0-100 estimate. */}
        <div className="shape-compare-midtick" />
        <span className="shape-compare-midtick-label">50</span>
        <div className="shape-compare-tick shape-compare-tick-comp" style={{ left: `${compPctile}%` }} />
        <div className="shape-compare-tick shape-compare-tick-player" style={{ left: `${playerPctile}%` }} />
      </div>
      <span className={`shape-compare-diff shape-compare-diff-${dir}`}>
        {diff > 0 ? `+${diff}` : diff === 0 ? "±0" : diff}
        <span className="shape-compare-diff-unit">pctl</span>
      </span>
    </div>
  );
}

// Renders the CompareBar row(s) relevant to whatever's selected in the
// stat table/radar above (see StatDetailRow's `selection`): one bar per
// Floor/Median/Ceiling for a selected stat (row mode), one bar for a
// selected stat+layer (cell mode), or -- mirroring PercentileCard's own
// column mode -- one ranked bar per stat, all in that one layer, for a
// whole-column selection. stats already carries the player's own
// {floorPctile, medianPctile, ceilingPctile} per stat key (built once in
// PlayerSimSearch.js), so this reads player numbers straight off it
// rather than needing them threaded in separately; peer is the one
// comp's own statFloorPercentiles/statPercentiles/statCeilingPercentiles.
function compPctileFor(peer, layer, key) {
  const table = layer === "floor" ? peer.statFloorPercentiles : layer === "ceiling" ? peer.statCeilingPercentiles : peer.statPercentiles;
  return table?.[key];
}

function CompareBars({ selection, stats, peer }) {
  if (!selection) return null;

  if (selection.mode === "column") {
    const layer = selection.layer;
    const pctileKey = `${layer}Pctile`;
    const ranked = [...stats].sort((a, b) => (b[pctileKey] ?? 0) - (a[pctileKey] ?? 0));
    return (
      <div className="shape-compare">
        <div className="shape-compare-head">{LAYER_LABEL[layer]} vs. player</div>
        {ranked.map((stat) => (
          <CompareBar key={stat.key} label={stat.label} playerPctile={stat[pctileKey]} compPctile={compPctileFor(peer, layer, stat.key)} />
        ))}
      </div>
    );
  }

  const stat = stats.find((s) => s.key === selection.key);
  if (!stat) return null;
  const layers = selection.mode === "cell" ? [selection.layer] : ["floor", "median", "ceiling"];
  return (
    <div className="shape-compare">
      <div className="shape-compare-head">{stat.label} vs. player</div>
      {layers.map((layer) => (
        <CompareBar
          key={layer}
          label={LAYER_LABEL[layer]}
          playerPctile={stat[`${layer}Pctile`]}
          compPctile={compPctileFor(peer, layer, selection.key)}
        />
      ))}
    </div>
  );
}

// Compact echo of StatDetailRow's own stat-detail-table, but clicking
// inside it does NOT touch the shared `selection` state the main table
// drives -- that state also turns on CompareBars below (the "X vs.
// player" diverging bars), which should only appear from an actual main-
// table selection, not from poking at a comp's own numbers. Instead,
// every click here (row, column, or cell) just calls onSelectLayer(layer)
// -- the exact same "put this comp's shape on the radar" toggle the F/M/C
// picker above already does -- so browsing a comp's own table only ever
// shows where THEY sit on the radar, never the player-vs-comp bars.
function MiniStatTable({ peer, keys, labelByKey, isActive, selectedLayer, onSelectLayer }) {
  const ranges = peer.stat_ranges;
  if (!ranges) return null;
  const rows = keys.filter((key) => ranges[key]);
  if (rows.length === 0) return null;

  return (
    <table className="shape-finder-table">
      <tbody>
        {rows.map((key) => {
          const { floor, median, ceiling } = ranges[key];
          function cellProps(layer) {
            const layerActive = isActive && selectedLayer === layer;
            return {
              className: `stat-row-trigger${layerActive ? " stat-row-trigger-column" : ""}`,
              onClick: () => onSelectLayer(layer),
              "aria-pressed": layerActive,
            };
          }
          return (
            <tr key={key}>
              <td>
                <button
                  type="button"
                  className="stat-row-trigger"
                  onClick={() => onSelectLayer("median")}
                  aria-pressed={isActive && selectedLayer === "median"}
                >
                  {labelByKey[key] || key}
                </button>
              </td>
              <td className="mono">
                <button type="button" {...cellProps("floor")}>{floor}</button>
              </td>
              <td className="mono">
                <button type="button" {...cellProps("median")}><strong>{median}</strong></button>
              </td>
              <td className="mono">
                <button type="button" {...cellProps("ceiling")}>{ceiling}</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Ranks every peer that shares the same stat-key signature as the current
// player (built in page.js -- QBs pool with QBs, but WRs and TEs pool
// together since they carry the exact same 3 receiving keys) by how close
// their percentile shape is, and lets you toggle the closest ones onto the
// radar as a dashed overlay via onSelect(name, layer). Each row carries its
// own Floor/Median/Ceiling picker (mirrors the main table's header trigger)
// so the comp can be held up against any one of your own three views, not
// just its median -- selectedLayer is which one is currently showing for
// whichever peer is active.
// Similarity % = 100 minus the RMS percentile-point gap across shared
// stats (sqrt(dist / key count) -- dist is a SUM of squared per-key gaps,
// so dividing back out by key count before rooting keeps this comparable
// across players who share different numbers of stats). 100% means an
// identical percentile shape; since each stat lives on a 0-100 percentile
// scale, an RMS gap can't exceed 100, so this can't go negative.
function similarityPct(a, b, keys) {
  if (!a || !b) return null;
  const dist = shapeDistance(a, b, keys);
  return Math.round(100 - Math.sqrt(dist / keys.length));
}

const TABLE_BY_LAYER = {
  floor: "statFloorPercentiles",
  median: "statPercentiles",
  ceiling: "statCeilingPercentiles",
};

export default function SimilarShapeFinder({
  ownName,
  statPercentiles,
  statFloorPercentiles,
  statCeilingPercentiles,
  stats,
  keys,
  peers,
  selectedName,
  selectedLayer,
  onSelect,
  selection,
}) {
  if (!peers || peers.length === 0 || !keys || keys.length === 0) return null;

  const ownTables = {
    statPercentiles,
    statFloorPercentiles,
    statCeilingPercentiles,
  };
  // stats already carries {key, label} in table order (built once in
  // PlayerSimSearch.js) -- reused here purely for its labels, which are
  // the same for every peer sharing this stat signature.
  const labelByKey = Object.fromEntries((stats || []).map((s) => [s.key, s.label]));

  // Ranking itself always goes by median shape (which 3 players get
  // listed at all doesn't change when you switch F/M/C -- only the shown
  // percentage for whichever one is currently active does, below).
  const ranked = peers
    .filter((p) => p.name !== ownName)
    .map((p) => {
      const dist = shapeDistance(statPercentiles, p.statPercentiles, keys);
      const rms = Math.sqrt(dist / keys.length);
      return { ...p, dist, similarity: Math.round(100 - rms) };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);

  if (ranked.length === 0) return null;

  return (
    <div className="shape-finder stat-panel stat-panel-finder">
      <div className="shape-finder-list">
        {ranked.map((p) => {
          const isActive = selectedName === p.name;
          // While this peer is the active comp, the shown percentage
          // tracks whichever Floor/Median/Ceiling view is selected --
          // floor-vs-floor, ceiling-vs-ceiling -- instead of always
          // reporting the median-shape ranking number. Falls back to that
          // ranking number when this peer isn't the active one, or if
          // either side is missing that layer's percentile table.
          const layer = isActive ? selectedLayer : "median";
          const layerSimilarity =
            isActive && layer !== "median"
              ? similarityPct(ownTables[TABLE_BY_LAYER[layer]], p[TABLE_BY_LAYER[layer]], keys)
              : null;
          const displaySimilarity = layerSimilarity ?? p.similarity;
          return (
            <div key={p.name} className={`shape-finder-entry${isActive ? " active" : ""}`}>
              {/* Name lives as its own full-width centered header above
                  the grid now, not sharing a column with the score box --
                  explicit ask, since a name sharing that narrow score-
                  width column was truncating hard ("Jaxon Smith-..."). */}
              <button
                type="button"
                className="shape-finder-name"
                onClick={() => onSelect(p.name, "median")}
                aria-pressed={isActive}
              >
                <span>{p.name}</span>
                <span className="shape-finder-pos mono">{p.position}</span>
              </button>
              {/* One shared 2-column grid for the remaining three pieces
                  (F/M/C picker, score, table) -- explicit ask to
                  incorporate the header/score/table into a single card,
                  AND to line the picker up with the table's own columns.
                  Column 1 is hard-set to the score box's own widest
                  possible content (the similarity percentage, "100%"),
                  and column 2 (capped at the table's own width) is THE
                  SAME grid track for both rows -- so the picker and the
                  table always render at the identical width by
                  construction. A flex/matched-max-width approach (tried
                  first) instead let a long name eat into column 1,
                  shrinking the picker without shrinking the table by the
                  same amount -- e.g. Trevor Lawrence's longer name
                  drifted the picker ~45px off the table's columns,
                  confirmed live. */}
              <div className="shape-finder-grid">
                <div className="shape-finder-layers mono" role="group" aria-label={`${p.name} comparison view`}>
                  {LAYERS.map((layer) => {
                    const layerActive = isActive && selectedLayer === layer.key;
                    return (
                      <button
                        key={layer.key}
                        type="button"
                        className={`shape-finder-layer-btn ${layerActive ? "active" : ""}`}
                        onClick={() => onSelect(p.name, layer.key)}
                        aria-pressed={layerActive}
                        aria-label={`Compare ${p.name}'s ${layer.name}`}
                      >
                        {LAYER_LABEL[layer.key]}
                      </button>
                    );
                  })}
                </div>
                <div className="shape-finder-score">
                  <div className="stat-radar-label">Match</div>
                  {p.sleeperId && (
                    <img
                      className="shape-finder-portrait"
                      src={`https://sleepercdn.com/content/nfl/players/thumb/${p.sleeperId}.jpg`}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <div className="shape-finder-score-value">{displaySimilarity}%</div>
                </div>
                <MiniStatTable
                  peer={p}
                  keys={keys}
                  labelByKey={labelByKey}
                  isActive={isActive}
                  selectedLayer={selectedLayer}
                  onSelectLayer={(clickedLayer) => onSelect(p.name, clickedLayer)}
                />
              </div>
              {stats && <CompareBars selection={selection} stats={stats} peer={p} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
