const TREND_MAP = {
  RISING: { cls: "up", label: "RISING" },
  FALLING: { cls: "down", label: "FALLING" },
  STEADY: { cls: "steady", label: "STEADY" },
};

// Same RISING/FALLING/STEADY colors as the homepage ticker -- last-4-games
// average vs. the weighted median baseline, +/-10% band. Up/down are pure
// CSS-drawn triangles (::before in globals.css), not a Unicode glyph --
// font-rendered ▲/▼ measured as centered in testing but still looked
// visibly off-center on at least one real device, and a font glyph's
// vertical metrics aren't something this codebase controls or can verify
// across every renderer. A CSS shape has no such variance.
export default function TrendTag({ trend }) {
  const t = TREND_MAP[trend];
  if (!t) return null;
  return (
    <span className={`trend-tag ${t.cls}`} title={t.label}>
      {t.cls === "steady" ? "—" : null}
    </span>
  );
}
