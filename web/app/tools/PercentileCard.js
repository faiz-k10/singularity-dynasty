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
// two modes share this row markup instead of diverging visually.
function PercentileRow({ label, pctile, isActive, onClick }) {
  return (
    <button type="button" className={`pctile-row${isActive ? " pctile-row-active" : ""}`} onClick={onClick}>
      <span className="pctile-row-label">{label}</span>
      <PercentileBar pctile={pctile} />
      <span className="pctile-row-value">{ordinal(pctile)}</span>
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
        <p>Select a stat, a Floor/Median/Ceiling column, or a single number above to see its percentile vs. the {position} pool.</p>
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
          <span className="pctile-hero-value">{ordinal(pctile)}</span>
          <span className={`pctile-hero-tier pctile-bar-${t.cls}`}>{t.label}</span>
        </div>
        <PercentileBar pctile={pctile} size="lg" />
      </div>
    );
  }

  // column mode -- ranked highest to lowest so the stat this player is
  // most elite in in that layer reads first, like a mini leaderboard.
  const layer = selection.layer;
  const ranked = [...stats].sort((a, b) => (b[`${layer}Pctile`] ?? 0) - (a[`${layer}Pctile`] ?? 0));
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
            pctile={stat[`${layer}Pctile`]}
            onClick={() => onSelectCell(stat.key, layer)}
          />
        ))}
      </div>
    </div>
  );
}
