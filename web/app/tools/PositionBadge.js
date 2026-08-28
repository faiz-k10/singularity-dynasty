// Same pill treatment as TeamBadge, using the site's existing
// --pos-qb/--pos-rb/--pos-wr/--pos-te theme tokens (already used
// elsewhere for the rankings-table row's left-border stripe) instead of
// a fixed-team-color lookup. Those tokens are deliberately theme-tuned --
// bright/pastel in dark mode, deep/saturated in light mode (see
// globals.css) -- so var(--void) as the text color rides that same flip
// automatically (near-black in dark mode, near-white in light mode)
// instead of needing TeamBadge's per-color luminance calculation.
const POS_COLOR_VAR = { QB: "--pos-qb", RB: "--pos-rb", WR: "--pos-wr", TE: "--pos-te" };

export default function PositionBadge({ position }) {
  if (!position) return <span className="mono">—</span>;
  const colorVar = POS_COLOR_VAR[position];
  return (
    <span
      className="position-badge"
      style={colorVar ? { background: `var(${colorVar})`, color: "var(--void)" } : undefined}
    >
      {position}
    </span>
  );
}
