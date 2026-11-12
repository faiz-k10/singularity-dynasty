"use client";

import { useId } from "react";

// The Night Sky's "Hubble kit" (Nov 11 2026, founder: polish the sky and skins with the Hubble Space Telescope's photographs as the
// inspiration -- Taschen's "Expanding Universe"; nothing copied, only the visual language): stars in different colour temperatures with
// soft halos and the four-point diffraction spikes of a reflecting telescope on the brightest, faint distant galaxies (the Hubble Deep
// Field), and nebulae as textured filaments (an feTurbulence cloud) in the gold / teal / rust "Hubble palette". SVG, in the sky's
// coordinates (-300..300). Colours come from --sky-* tokens so the light theme draws the same field in ink (globals.css).

export const seeded = (seed, n, f) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); return Array.from({ length: n }, () => f(r)); };
const TEMPS = ["var(--sky-t-blue)", "var(--sky-t-white)", "var(--sky-t-white)", "var(--sky-t-gold)", "var(--sky-t-orange)"];

// A field of stars: most faint, a few bright (a power law, like a real field), the brightest with spikes.
function makeField(seed, n, span) {
  return seeded(seed, n, (r) => {
    const m = Math.pow(r(), 3.2); // brightness 0..1, mostly faint
    return { x: (r() - 0.5) * span, y: (r() - 0.5) * span, m, t: TEMPS[Math.floor(r() * TEMPS.length)] };
  });
}
const FIELDS = new Map();
const fieldFor = (seed, n, span) => { const k = `${seed}:${n}:${span}`; if (!FIELDS.has(k)) FIELDS.set(k, makeField(seed, n, span)); return FIELDS.get(k); };

export function Spikes({ x, y, len, color, width = 0.8, opacity = 0.9 }) {
  // Hubble's four diffraction spikes: two thin crossed lines that fade out from the star.
  return (
    <g opacity={opacity} style={{ stroke: color }} strokeWidth={width} strokeLinecap="round">
      <line x1={x - len} y1={y} x2={x + len} y2={y} strokeOpacity=".55" />
      <line x1={x} y1={y - len} x2={x} y2={y + len} strokeOpacity=".55" />
      <line x1={x - len * 0.45} y1={y} x2={x + len * 0.45} y2={y} />
      <line x1={x} y1={y - len * 0.45} x2={x} y2={y + len * 0.45} />
    </g>
  );
}

export function StarField({ seed = 7, n = 170, span = 600, spikes = 6, scale = 1 }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const stars = fieldFor(seed, n, span);
  const bright = [...stars].sort((a, b) => b.m - a.m).slice(0, spikes);
  const halo = (t) => `url(#${id}h${TEMPS.indexOf(t)})`;
  return (
    <g aria-hidden="true">
      <defs>
        {TEMPS.map((t, i) => <radialGradient key={i} id={`${id}h${i}`}><stop offset="0" style={{ stopColor: t }} stopOpacity=".55" /><stop offset=".4" style={{ stopColor: t }} stopOpacity=".12" /><stop offset="1" style={{ stopColor: t }} stopOpacity="0" /></radialGradient>)}
      </defs>
      {stars.map((s, i) => {
        const r = (0.3 + s.m * 1.8) * scale;
        return (
          <g key={i}>
            {s.m > 0.35 && <circle cx={s.x} cy={s.y} r={r * 4.5} fill={halo(s.t)} />}
            <circle cx={s.x} cy={s.y} r={r} style={{ fill: s.t }} fillOpacity={0.35 + s.m * 0.65} />
          </g>
        );
      })}
      {bright.map((s, i) => <Spikes key={`k${i}`} x={s.x} y={s.y} len={(8 + s.m * 18) * scale} color={s.t} width={0.55 * scale} opacity={0.75} />)}
    </g>
  );
}

// Faint distant galaxies: small tilted ellipses with a bright core, a few spirals.
export function Galaxies({ seed = 31, n = 14, span = 600, scale = 1, id }) {
  const gs = seeded(seed, n, (r) => ({ x: (r() - 0.5) * span, y: (r() - 0.5) * span, s: (1.6 + r() * 4.2) * scale, tilt: r() * 180, flat: 0.25 + r() * 0.55, warm: r() < 0.6, spiral: r() < 0.3 }));
  return (
    <g aria-hidden="true">
      <defs>
        <radialGradient id={`${id}gw`}><stop offset="0" style={{ stopColor: "var(--sky-gal-warm)" }} stopOpacity=".95" /><stop offset=".35" style={{ stopColor: "var(--sky-gal-warm)" }} stopOpacity=".35" /><stop offset="1" style={{ stopColor: "var(--sky-gal-warm)" }} stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}gc`}><stop offset="0" style={{ stopColor: "var(--sky-gal-cool)" }} stopOpacity=".9" /><stop offset=".35" style={{ stopColor: "var(--sky-gal-cool)" }} stopOpacity=".3" /><stop offset="1" style={{ stopColor: "var(--sky-gal-cool)" }} stopOpacity="0" /></radialGradient>
      </defs>
      {gs.map((g, i) => (
        <g key={i} transform={`translate(${g.x} ${g.y}) rotate(${g.tilt})`} opacity=".7">
          <ellipse rx={g.s * 2.2} ry={g.s * 2.2 * g.flat} fill={`url(#${id}${g.warm ? "gw" : "gc"})`} />
          {g.spiral && <path d={`M ${-g.s * 1.8} ${-g.s * 0.2} Q 0 ${-g.s * 1.1} ${g.s * 1.8} ${g.s * 0.2} M ${-g.s * 1.8} ${g.s * 0.2} Q 0 ${g.s * 1.1} ${g.s * 1.8} ${-g.s * 0.2}`} fill="none" style={{ stroke: g.warm ? "var(--sky-gal-warm)" : "var(--sky-gal-cool)" }} strokeOpacity=".3" strokeWidth={g.s * 0.25} transform={`scale(1 ${g.flat})`} />}
          <ellipse rx={g.s * 0.35} ry={g.s * 0.35 * g.flat} style={{ fill: "var(--sky-t-white)" }} fillOpacity=".85" />
        </g>
      ))}
    </g>
  );
}

// A textured cloud: fractal noise turned into wisps (alpha from the noise, with contrast), clipped to a soft shape. `color` is the cloud's
// colour; `freq` the size of its structure; the shape is an ellipse with a radial falloff.
export function Cloud({ id, cx = 0, cy = 0, rx, ry, rot = 0, color, freq = 0.012, seed = 2, strength = 1 }) {
  return (
    <g aria-hidden="true">
      <defs>
        <radialGradient id={`${id}m`}><stop offset="0" stopColor="#FFFFFF" stopOpacity="1" /><stop offset=".6" stopColor="#FFFFFF" stopOpacity=".55" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" /></radialGradient>
        <filter id={`${id}t`} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves="5" seed={seed} result="n" />
          <feColorMatrix in="n" type="matrix" values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${2.6 * strength} 0 0 0 ${-1.05}`} result="wisps" />
          <feComposite in="wisps" in2="SourceGraphic" operator="in" result="shaped" />
          <feFlood floodColor={color} result="c" />
          <feComposite in="c" in2="shaped" operator="in" />
        </filter>
      </defs>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${rot} ${cx} ${cy})`} fill={`url(#${id}m)`} filter={`url(#${id}t)`} />
    </g>
  );
}
