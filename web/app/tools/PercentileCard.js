const LAYER_LABEL = { floor: "Floor", median: "Median", ceiling: "Ceiling" };

function ordinal(n) {
  const rounded = Math.round(n);
  const rem100 = rounded % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${rounded}th`;
  switch (rounded % 10) {
    case 1:
      return `${rounded}st`;
    case 2:
      return `${rounded}nd`;
    case 3:
      return `${rounded}rd`;
    default:
      return `${rounded}th`;
  }
}

// Same break points drive both the text tier and the bar-fill color, so
// "Elite" always means the gold fill and never lines up with a blue bar.
function tier(pctile) {
  if (pctile >= 90) return { label: "Elite", cls: "elite" };
  if (pctile >= 70) return { label: "Above Average", cls: "above" };
  if (pctile >= 40) return { label: "Average", cls: "avg" };
  if (pctile >= 15) return { label: "Below Average", cls: "below" };
  return { label: "Weak", cls: "weak" };
}

function formatValue(value) {
  return value == null ? "—" : String(Math.round(value));
}

// 50th-percentile reference tick + label -- fixed dead center regardless
// of the fill's own width, mirroring the same reference mark on
// SimilarShapeFinder's comp bars, so "above/below average" reads at a
// glance here too instead of eyeballing where the fill ends on a 0-100
// scale.
function PercentileBar({ pctile, size }) {
  const t = tier(pctile);
  return (
    <div className={`pctile-bar${size === "lg" ? " pctile-bar-lg" : ""}`}>
      <div className={`pctile-bar-fill pctile-bar-${t.cls}`} style={{ width: `${Math.max(pctile, 2)}%` }} />
      <div className="pctile-bar-midtick" />
      <span className="pctile-bar-midtick-label">50</span>
    </div>
  );
}

// One row per Floor/Median/Ceiling (row mode) or per stat (column mode) --
// same shape either way, just a different label + click target, so the
// two modes share this row markup instead of diverging visually. Shows
// the raw stat value (what the table itself would show) stacked over the
// percentile, so the shape/percentile view doesn't require flipping back
// to the table to see the actual number behind it.
function PercentileRow({ label, value, pctile, isActive, onClick }) {
  return (
    <button type="button" className={`pctile-row${isActive ? " pctile-row-active" : ""}`} onClick={onClick}>
      <span className="pctile-row-label">{label}</span>
      <PercentileBar pctile={pctile} />
      <span className="pctile-row-value">
        <span className="pctile-row-raw">{formatValue(value)}</span>
        <span className="pctile-row-ordinal">{ordinal(pctile)}</span>
      </span>
    </button>
  );
}

// Card under the stat table that spells out whichever Floor/Median/
// Ceiling percentile(s) the current table/radar selection points at --
// stats is [{key, label, floorPctile, medianPctile, ceilingPctile}, ...]
// in the same order as the table, position is the player's position (for
// the "vs. RB pool" caption), selection/onSelectCell mirror StatDetailRow
// so clicking a row here drives the same shared selection as clicking a
// table cell or a radar vertex.
// rankColumnByPercentile: the single-player page ranks column mode as a
// mini leaderboard (that player's best stat first). Compare Players sets
// this false -- with three cards side by side, each ranked by its own
// player's percentiles would put a different stat on the same row of
// each card, defeating the point of comparing the same stat across
// players; there it stays in fixed STAT_LABELS order instead.
export default function PercentileCard({ stats, position, selection, onSelectCell, rankColumnByPercentile = true }) {
  if (!stats.length) return null;

  if (!selection) {
    return (
      <div className="pctile-card pctile-card-empty">
        <p>Select a stat, a Floor/Median/Ceiling column, or a single number above to see its percentile vs. the {position} pool.</p>
      </div>
    );
  }

  // Row/cell selections name one specific stat key, which -- on the
  // Compare Players page, where this same selection is shared across
  // players of different positions -- might just not exist for this
  // particular player (a passing_yards selection has nothing to show
  // for a compared WR). A quiet fallback here instead of rendering
  // nothing keeps that player's card in place rather than leaving an
  // unexplained gap in the grid; never triggers on the single-player
  // page, where `stats` always belongs to the same player selection.key
  // was set from.
  if ((selection.mode === "row" || selection.mode === "cell") && !stats.some((s) => s.key === selection.key)) {
    return (
      <div className="pctile-card pctile-card-empty">
        <p>Doesn&apos;t apply to {position}.</p>
      </div>
    );
  }

  if (selection.mode === "row") {
    const stat = stats.find((s) => s.key === selection.key);
    if (!stat) return null;
    return (
      <div className="pctile-card">
        <div className="pctile-card-head">
          <span className="pctile-card-title">{stat.label}</span>
          <span className="pctile-card-sub">vs. {position} pool</span>
        </div>
        <div className="pctile-rows">
          {["floor", "median", "ceiling"].map((layer) => (
            <PercentileRow
              key={layer}
              label={LAYER_LABEL[layer]}
              value={stat[`${layer}Value`]}
              pctile={stat[`${layer}Pctile`]}
              onClick={() => onSelectCell(stat.key, layer)}
            />
          ))}
        </div>
      </div>
    );
  }

  if (selection.mode === "cell") {
    const stat = stats.find((s) => s.key === selection.key);
    if (!stat) return null;
    const pctile = stat[`${selection.layer}Pctile`];
    const value = stat[`${selection.layer}Value`];
    const t = tier(pctile);
    return (
      <div className="pctile-card">
        <div className="pctile-card-head">
          <span className="pctile-card-title">
            {stat.label} · {LAYER_LABEL[selection.layer]}
          </span>
          <span className="pctile-card-sub">vs. {position} pool</span>
        </div>
        <div className="pctile-hero">
          <span className="pctile-hero-value">{formatValue(value)}</span>
          <span className="pctile-hero-pctile">{ordinal(pctile)}</span>
          <span className={`pctile-hero-tier pctile-bar-${t.cls}`}>{t.label}</span>
        </div>
        <PercentileBar pctile={pctile} size="lg" />
      </div>
    );
  }

  // column mode -- ranked highest to lowest so the stat this player is
  // most elite in in that layer reads first, like a mini leaderboard
  // (single-player page only -- see rankColumnByPercentile above).
  const layer = selection.layer;
  const ranked = rankColumnByPercentile
    ? [...stats].sort((a, b) => (b[`${layer}Pctile`] ?? 0) - (a[`${layer}Pctile`] ?? 0))
    : stats;
  return (
    <div className="pctile-card">
      <div className="pctile-card-head">
        <span className="pctile-card-title">{LAYER_LABEL[layer]} percentile by stat</span>
        <span className="pctile-card-sub">vs. {position} pool</span>
      </div>
      <div className="pctile-rows">
        {ranked.map((stat) => (
          <PercentileRow
            key={stat.key}
            label={stat.label}
            value={stat[`${layer}Value`]}
            pctile={stat[`${layer}Pctile`]}
            onClick={() => onSelectCell(stat.key, layer)}
          />
        ))}
      </div>
    </div>
  );
}
