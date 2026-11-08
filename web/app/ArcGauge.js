// A half-circle dial (the site's gauge for board views: win chance on the Game Board scoreboard and the home briefing, the dynasty
// score). One solid arc -- never segmented, so it can't be read as a count -- coloured by `--tone` (mint unless the parent sets it),
// with a needle at the reading. `value` is 0-1; `children` sit in the middle of the dial.
export default function ArcGauge({ value, size = 96, label, children, className = "" }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const r = 40, cx = 50, cy = 48, a = Math.PI * (1 - v);
  const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
  const nx = cx + (r + 7) * Math.cos(a), ny = cy - (r + 7) * Math.sin(a);
  return (
    <span className={`arc-gauge ${className}`} style={{ width: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 100 54" width={size} height={size * 0.54} aria-hidden="true">
        <path className="arc-gauge-track" d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} />
        {v > 0 && <path className="arc-gauge-fill" d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} />}
        <line className="arc-gauge-needle" x1={(cx + (r - 4) * Math.cos(a)).toFixed(2)} y1={(cy - (r - 4) * Math.sin(a)).toFixed(2)} x2={nx.toFixed(2)} y2={ny.toFixed(2)} />
      </svg>
      {children != null && <span className="arc-gauge-mid">{children}</span>}
    </span>
  );
}
