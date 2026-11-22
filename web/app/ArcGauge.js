// A half-circle dial (the site's gauge for board views: win chance on the Game Board cards / scoreboard and the home briefing, the dynasty
// score). One solid arc -- never segmented, so it can't be read as a count -- coloured by the parent's `--tone` (mint when none), with a
// needle at the reading. `value` is 0-1; `children` sit in the middle of the dial. `height` (px) flattens it into a wider half-ellipse:
// by default the dial is a true half circle (height = 0.54 x size). `from` (0-1, optional) marks an earlier reading with a tick (in the
// dial's tone) and draws an arrow ON the band from it to `value` (the dynasty profile: where his score was nine games ago; the arrow's
// colour is the parent's --trail).
export default function ArcGauge({ value, from, size = 96, height, label, children, className = "" }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const h = height || size * 0.54;
  const k = (size / h) * 0.54; // how much wider than a circle
  const W = 100 * k, cx = 50 * k, cy = 48, rx = 40 * k, ry = 40, a = Math.PI * (1 - v);
  const at = (dx, dy) => [(cx + (rx + dx) * Math.cos(a)).toFixed(2), (cy - (ry + dy) * Math.sin(a)).toFixed(2)];
  const [x, y] = at(0, 0);
  const [x1, y1] = at(-4, -4);
  const [x2, y2] = at(7, 7);
  // the trail: an arrow along the middle of the band from `from` to just short of the needle, and a tick at `from`
  let trail = null;
  if (from != null && Number.isFinite(from)) {
    const f = Math.max(0, Math.min(1, from)), R = 0, a0 = Math.PI * (1 - f);
    const up = v > f, dir = up ? 1 : -1;
    const a1 = a + dir * 0.05; // the head's tip stops just before the needle
    if ((a0 - a1) * dir > 0.04) {
      const pt = (t) => [cx + (rx + R) * Math.cos(t), cy - (ry + R) * Math.sin(t)];
      // stop the line short of the head; the head's tip sits at a1
      const back = Math.min(0.08, Math.abs(a1 - a0) / 2);
      // the line starts at the tick's outer edge (half the cased tick's width, 2 units, along the arc) so tick and arrow read as one piece
      const [sx, sy] = pt(a0 - dir * (2 / rx)), [ex, ey] = pt(a1 + dir * back), [hx, hy] = pt(a1);
      const tx = dir * (rx + R) * Math.sin(a1), ty = dir * (ry + R) * Math.cos(a1), tl = Math.hypot(tx, ty) || 1; // direction of travel
      const ux = tx / tl, uy = ty / tl, nx = -uy, ny = ux, L = 4.5, Wd = 2.6;
      const tick = (dx, dy) => [(cx + (rx + dx) * Math.cos(a0)).toFixed(2), (cy - (ry + dy) * Math.sin(a0)).toFixed(2)];
      const [fx1, fy1] = tick(-4, -4), [fx2, fy2] = tick(7, 7);
      const head = [[hx, hy], [hx - ux * L + nx * Wd, hy - uy * L + ny * Wd], [hx - ux * L - nx * Wd, hy - uy * L - ny * Wd]];
      trail = (
        <g className="arc-gauge-trail">
          <line className="arc-gauge-from-case" x1={fx1} y1={fy1} x2={fx2} y2={fy2} />
          <line className="arc-gauge-from" x1={fx1} y1={fy1} x2={fx2} y2={fy2} />
          <path d={`M${sx.toFixed(2)} ${sy.toFixed(2)} A${rx + R} ${ry + R} 0 0 ${up ? 1 : 0} ${ex.toFixed(2)} ${ey.toFixed(2)}`} />
          <polygon points={head.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(" ")} />
        </g>
      );
    }
  }
  return (
    <span className={`arc-gauge ${className}`} style={{ width: size }} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${W.toFixed(2)} 54`} width={size} height={h} aria-hidden="true">
        <path className="arc-gauge-track" d={`M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`} />
        {v > 0 && <path className="arc-gauge-fill" d={`M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${x} ${y}`} />}
        {trail}
        <line className="arc-gauge-needle" x1={x1} y1={y1} x2={x2} y2={y2} />
      </svg>
      {children != null && <span className="arc-gauge-mid">{children}</span>}
    </span>
  );
}
