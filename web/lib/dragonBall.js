// Super Hero badge art: an orange crystal ball with 1-6 red stars, one asset per count of top-3 finishes
// this season (capped at 6). Pure geometry so the React badge and any preview/export share one source.
// Coordinates are a 64x64 viewBox with the ball centred at (32,32), radius 29.

export const MAX_BALL_STARS = 6;

const round = (n) => Math.round(n * 100) / 100;

// Star centres and outer radius per star count (the more stars, the smaller each one).
const LAYOUT = {
  1: { r: 14, at: [[32, 32]] },
  2: { r: 11, at: [[22.5, 32], [41.5, 32]] },
  3: { r: 9.5, at: [[32, 20.5], [21.5, 38.5], [42.5, 38.5]] },
  4: { r: 8.8, at: [[32, 18.5], [18.5, 32], [45.5, 32], [32, 45.5]] },
  5: { r: 8, at: pentagon(32, 32, 15) },
  6: { r: 7.2, at: hexagon(32, 32, 15.5) },
};

function pentagon(cx, cy, d) {
  return [0, 1, 2, 3, 4].map((k) => {
    const a = ((-90 + 72 * k) * Math.PI) / 180;
    return [round(cx + d * Math.cos(a)), round(cy + d * Math.sin(a))];
  });
}
function hexagon(cx, cy, d) {
  return [0, 1, 2, 3, 4, 5].map((k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return [round(cx + d * Math.cos(a)), round(cy + d * Math.sin(a))];
  });
}

// A five-point star with the given centre and outer radius, point up.
export function starPoints(cx, cy, R) {
  const r = R * 0.382;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = ((-90 + 36 * i) * Math.PI) / 180;
    pts.push(`${round(cx + rad * Math.cos(a))},${round(cy + rad * Math.sin(a))}`);
  }
  return pts.join(" ");
}

export function ballStars(count) {
  const n = Math.max(1, Math.min(Math.floor(count) || 1, MAX_BALL_STARS));
  const { r, at } = LAYOUT[n];
  return { count: n, stars: at.map(([x, y]) => starPoints(x, y, r)) };
}

// The approved ball art as an SVG string (React renders it through DragonBall.js; the vanilla-DOM ticker uses it
// directly). Gradient ids are per star count, so every instance of the same ball carries identical defs.
// Colors: the site's own orange ramp (--horizon-gold / --horizon), a neon-blue rim light, red stars.
// `size` is the diameter of the ball itself (the viewBox is cropped to the ball's edge; the soft halo spills outside it),
// so a 24px ball fills a 24px badge slot exactly like the other medallions.
export function dragonBallSvg(count, size = 24) {
  const { count: n, stars } = ballStars(count);
  const id = `db${n}`;
  return (
    `<svg width="${size}" height="${size}" viewBox="5 5 54 54" style="overflow:visible" aria-hidden="true" focusable="false">` +
    `<defs>` +
    `<radialGradient id="${id}g" cx="50%" cy="50%" r="50%"><stop offset="0.6" stop-color="#FF7A45" stop-opacity="0.4"/><stop offset="1" stop-color="#FF7A45" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id}b" cx="37%" cy="30%" r="80%"><stop offset="0" stop-color="#FFEDB8"/><stop offset="0.22" stop-color="#FFC773"/><stop offset="0.52" stop-color="#FF9A4D"/><stop offset="0.76" stop-color="#FF7A45"/><stop offset="1" stop-color="#A93A0B"/></radialGradient>` +
    `<radialGradient id="${id}h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.92"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id}u" cx="50%" cy="100%" r="70%"><stop offset="0" stop-color="#FFD9A0" stop-opacity="0.55"/><stop offset="1" stop-color="#FFD9A0" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<circle cx="32" cy="32" r="31.5" fill="url(#${id}g)"/>` +
    `<circle cx="32" cy="32" r="27" fill="url(#${id}b)" stroke="#5E1D06" stroke-width="1.4"/>` +
    `<circle cx="32" cy="32" r="27" fill="url(#${id}u)"/>` +
    `<circle cx="32" cy="32" r="24.3" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="0.8"/>` +
    `<g transform="translate(32 32) scale(.93) translate(-32 -32)">` +
    stars.map((pts) => `<polygon points="${pts}" fill="#D81E14" stroke="#6E0A04" stroke-width="1.1" stroke-linejoin="round"/>`).join("") +
    `</g>` +
    `<ellipse cx="22.5" cy="18.5" rx="10" ry="5.6" transform="rotate(-35 22.5 18.5)" fill="url(#${id}h)"/>` +
    `<path d="M46.5 44a19.5 19.5 0 0 1-15 10.2" fill="none" stroke="#3DDCFF" stroke-opacity="0.65" stroke-width="1.8" stroke-linecap="round"/>` +
    `</svg>`
  );
}
