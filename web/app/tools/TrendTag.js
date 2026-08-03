const TREND_MAP = {
  RISING: { cls: "up", arrow: "▲", label: "RISING" },
  FALLING: { cls: "down", arrow: "▼", label: "FALLING" },
  STEADY: { cls: "steady", arrow: "—", label: "STEADY" },
};

// Same RISING/FALLING/STEADY language and colors as the homepage ticker —
// last-4-games average vs. the weighted median baseline, +/-10% band.
export default function TrendTag({ trend }) {
  const t = TREND_MAP[trend];
  if (!t) return null;
  return (
    <span className={`trend-tag ${t.cls}`}>
      {t.label} {t.arrow}
    </span>
  );
}
