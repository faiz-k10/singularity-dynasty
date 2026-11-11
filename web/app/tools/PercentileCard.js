import { ordinal } from "@/lib/format";

const LAYER_LABEL = { floor: "Floor", median: "Median", ceiling: "Ceiling" };


// Same break points drive both the text tier and the bar-fill color, so
// "Elite" always means the gold fill and never lines up with a blue bar.
function tier(pctile) {
  if (pctile >= 90) return { label: "Elite", cls: "elite" };
  if (pctile >= 70) return { label: "Above Average", cls: "above" };
  if (pctile >= 40) return { label: "Average", cls: "avg" };
  if (pctile >= 15) return { label: "Below Average", cls: "below" };
  return { label: "Weak", cls: "weak" };
}

// Whole-number stats (yards, TDs, receptions) still round to an integer;
// decimal stats (yac_above_exp, target_share) keep up to 2 places
// instead of getting rounded away to a meaningless whole number.
function formatValue(value) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
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

// One vertical bar per Floor/Median/Ceiling (row mode) or per stat
// (column mode) -- same shape either way, just a different label + click
// target, so the two modes share this markup instead of diverging
// visually. Value + ordinal sit below the bar, above the label (what the table itself
// would show), the 50th-percentile reference line runs across the track
// at its fixed midpoint regardless of the fill's own height, and the
// stat/layer label sits below -- same information as the old horizontal
// row, just read top-to-bottom/bar-height instead of left-to-right/bar-
// width, closer to how a real bar chart reads.
function PercentileVBar({ label, value, pctile, layer, isActive, onClick }) {
  return (
    <button type="button" className={`pctile-vbar${isActive ? " pctile-vbar-active" : ""}`} onClick={onClick}>
      {/* the percentile sits above the bar, the raw number under it (founder, Nov 10 2026) */}
      <span className="pctile-row-ordinal pctile-vbar-top">{ordinal(pctile)}</span>
      <div className="pctile-vbar-track">
        <div className="pctile-vbar-midline" />
        <span className="pctile-vbar-midline-label">50</span>
        <div className={`pctile-vbar-fill pctile-vbar-fill-${layer}`} style={{ height: `${Math.max(pctile, 2)}%` }} />
      </div>
      {/* the numbers sit under the bar, above the label (founder, Nov 10 2026) */}
      <span className="pctile-vbar-value">
        <span className="pctile-row-raw">{formatValue(value)}</span>
      </span>
      <span className="pctile-vbar-label">{label}</span>
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
export default function PercentileCard({ stats, position, selection, onSelectCell }) {
  if (!stats.length) return null;

  if (!selection) {
    return (
      <div className="pctile-card pctile-card-empty">
        <p>Select a stat, a Floor/Median/Ceiling column, or a single number to see its percentile vs. the {position} pool.</p>
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
            <PercentileVBar
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
    const pos = Math.min(100, Math.max(0, pctile ?? 0));
    return (
      <div className="pctile-card pctile-card-cell">
        <div className="pctile-card-head">
          <span className="pctile-card-sub">vs. {position} pool</span>
        </div>
        {/* One number picked: its percentile as the big headline (the stat value sits underneath), where it sits on the whole pool's 0-100 scale, and the
            same stat's three layers underneath (click one to move there), so the panel is never mostly empty. */}
        <div className="pctile-cell">
          <div className="pctile-cell-hero">
            {pctile == null ? "—" : Math.round(pctile)}
            {pctile != null && <span className="pctile-cell-hero-sym">%ile</span>}
          </div>
          <div className="pctile-cell-read">
            <span className="pctile-cell-value">
              {formatValue(value)}
              <span className="pctile-cell-stat">{stat.label}</span>
            </span>
            <span className={`pctile-hero-tier pctile-bar-${t.cls}`}>{t.label}</span>
          </div>
          <div className="pctile-scale">
            <div className="pctile-scale-track">
              <div className={`pctile-scale-fill pctile-bar-${t.cls}`} style={{ width: `${Math.max(pos, 1)}%` }} />
              <div className="pctile-scale-mid" />
              <div className="pctile-scale-dot" style={{ left: `${pos}%` }} />
            </div>
            <div className="pctile-scale-ticks">
              {[0, 25, 50, 75, 100].map((n) => (
                <span key={n} style={{ left: `${n}%` }}>{n}</span>
              ))}
            </div>
          </div>
          <p className="pctile-cell-sentence">Higher than {Math.round(pos)}% of the {position} pool for this stat.</p>
          <div className="pctile-layers">
            {["floor", "median", "ceiling"].map((layer) => (
              <button
                key={layer}
                type="button"
                className={`pctile-layer${layer === selection.layer ? " pctile-layer-active" : ""}`}
                onClick={() => onSelectCell(stat.key, layer)}
              >
                <span className="pctile-layer-name">{LAYER_LABEL[layer]}</span>
                <span className="pctile-layer-value">{formatValue(stat[`${layer}Value`])}</span>
                <span className="pctile-layer-ord">{stat[`${layer}Pctile`] == null ? "—" : ordinal(stat[`${layer}Pctile`])}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // column mode -- the bars follow the stat table's order (founder, Nov 10 2026), never a ranking by percentile
  const layer = selection.layer;
  const ranked = stats;
  return (
    <div className="pctile-card">
      <div className="pctile-card-head">
        <span className="pctile-card-title">{LAYER_LABEL[layer]} percentile by stat</span>
        <span className="pctile-card-sub">vs. {position} pool</span>
      </div>
      <div className="pctile-rows">
        {ranked.map((stat) => (
          <PercentileVBar
            key={stat.key}
            label={stat.label}
            value={stat[`${layer}Value`]}
            pctile={stat[`${layer}Pctile`]}
            layer={layer}
            onClick={() => onSelectCell(stat.key, layer)}
          />
        ))}
      </div>
    </div>
  );
}
