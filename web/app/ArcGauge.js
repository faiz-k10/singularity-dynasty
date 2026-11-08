// A half-circle dial (the site's gauge for board views: win chance on the Game Board cards / scoreboard and the home briefing, the dynasty
// score). One solid arc -- never segmented, so it can't be read as a count -- coloured by the parent's `--tone` (mint when none), with a
// needle at the reading. `value` is 0-1; `children` sit in the middle of the dial. `height` (px) flattens it into a wider half-ellipse:
// by default the dial is a true half circle (height = 0.54 x size).
export default function ArcGauge({ value, size = 96, height, label, children, className = "" }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const h = height || size * 0.54;
  const k = (size / h) * 0.54; // how much wider than a circle
  const W = 100 * k, cx = 50 * k, cy = 48, rx = 40 * k, ry = 40, a = Math.PI * (1 - v);
  const at = (dx, dy) => [(cx + (rx + dx) * Math.cos(a)).toFixed(2), (cy - (ry + dy) * Math.sin(a)).toFixed(2)];
  const [x, y] = at(0, 0);
  const [x1, y1] = at(-4, -4);
  const [x2, y2] = at(7, 7);
  return (
    <span className={`arc-gauge ${className}`} style={{ width: size }} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${W.toFixed(2)} 54`} width={size} height={h} aria-hidden="true">
        <path className="arc-gauge-track" d={`M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`} />
        {v > 0 && <path className="arc-gauge-fill" d={`M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${x} ${y}`} />}
        <line className="arc-gauge-needle" x1={x1} y1={y1} x2={x2} y2={y2} />
      </svg>
      {children != null && <span className="arc-gauge-mid">{children}</span>}
    </span>
  );
}
