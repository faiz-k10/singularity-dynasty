"use client";

import { useId } from "react";

// The Night Sky's skins (rules and unlocks: SKINS in lib/nightSky.js). Drawn in the sky's own coordinates (-300..300, the core at 0,0, its
// body r 44, the gauge r 74-84) so the same pieces serve the sky, the small previews in the Skins panel and nothing else. Cosmetic art, so
// these colours are fixed like the badge art; every animation stops for reduced motion (.sky-skin-* in globals.css).

const seeded = (seed, n, f) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); return Array.from({ length: n }, () => f(r)); };
const bandStars = seeded(11, 240, (r) => { const along = r() * 900 - 450, across = (r() + r() + r() - 1.5) * 70; return [along, across, 0.3 + r() * 0.8, 0.2 + r() * 0.5]; });

export function SkyBackdrop({ skin }) {
  const id = useId().replace(/:/g, "");
  if (skin === "nebula") return (
    <g aria-hidden="true">
      <defs>
        {[["a", "#8B6CF0"], ["b", "#2FB6A8"], ["c", "#D0609A"]].map(([k, c]) => (
          <radialGradient key={k} id={`${id}${k}`}><stop offset="0" stopColor={c} stopOpacity=".34" /><stop offset="1" stopColor={c} stopOpacity="0" /></radialGradient>
        ))}
      </defs>
      <ellipse cx="-150" cy="-50" rx="240" ry="150" fill={`url(#${id}a)`} transform="rotate(-20 -150 -50)" />
      <ellipse cx="170" cy="130" rx="220" ry="140" fill={`url(#${id}b)`} transform="rotate(25 170 130)" />
      <ellipse cx="60" cy="-210" rx="150" ry="90" fill={`url(#${id}c)`} />
    </g>
  );
  if (skin === "aurora") return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" x2="1"><stop offset="0" stopColor="#3EE08F" stopOpacity="0" /><stop offset=".3" stopColor="#3EE08F" /><stop offset=".7" stopColor="#2CC9E8" /><stop offset="1" stopColor="#8B6CF0" stopOpacity="0" /></linearGradient>
        <filter id={`${id}f`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
      </defs>
      <g className="sky-skin-drift" filter={`url(#${id}f)`} opacity=".42">
        <path d="M-320 -150 C -160 -250, -10 -90, 320 -200" stroke={`url(#${id}g)`} strokeWidth="46" fill="none" />
        <path d="M-320 -90 C -120 -170, 60 -40, 320 -130" stroke={`url(#${id}g)`} strokeWidth="26" fill="none" opacity=".7" />
      </g>
    </g>
  );
  if (skin === "milkyway") return (
    <g aria-hidden="true" transform="rotate(-32)">
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: "var(--sky-band)" }} stopOpacity="0" /><stop offset=".5" style={{ stopColor: "var(--sky-band)" }} stopOpacity=".16" /><stop offset="1" style={{ stopColor: "var(--sky-band)" }} stopOpacity="0" /></linearGradient>
      </defs>
      <rect x="-460" y="-90" width="920" height="180" fill={`url(#${id}m)`} />
      {bandStars.map(([x, y, r, o], i) => <circle key={i} cx={x} cy={y} r={r} fill="var(--sky-white)" fillOpacity={o} />)}
    </g>
  );
  if (skin === "eclipse") return (
    <g aria-hidden="true">
      <defs>
        <radialGradient id={`${id}e`}><stop offset=".45" stopColor="#B3261E" stopOpacity="0" /><stop offset="1" stopColor="#B3261E" stopOpacity=".28" /></radialGradient>
        <radialGradient id={`${id}c`}><stop offset=".55" stopColor="#F2B04A" stopOpacity="0" /><stop offset=".7" stopColor="#F2B04A" stopOpacity=".28" /><stop offset="1" stopColor="#F2B04A" stopOpacity="0" /></radialGradient>
      </defs>
      <rect x="-300" y="-300" width="600" height="600" fill={`url(#${id}e)`} />
      <circle r="120" fill={`url(#${id}c)`} />
    </g>
  );
  return null; // deep field: the plain sky
}

// layer "back" sits behind the core's body, "front" in front of it (rings and disks pass in front on their near side).
export function CoreSkin({ skin, layer }) {
  const id = useId().replace(/:/g, "");
  if (skin === "pulsar" && layer === "back") return (
    <g aria-hidden="true">
      <defs><linearGradient id={`${id}p`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" style={{ stopColor: "var(--sky-glow)" }} stopOpacity=".75" /><stop offset="1" style={{ stopColor: "var(--sky-glow)" }} stopOpacity="0" /></linearGradient></defs>
      <g className="sky-skin-spin is-slow">
        <polygon points="-5,0 5,0 18,-250 -18,-250" fill={`url(#${id}p)`} />
        <polygon points="-5,0 5,0 18,-250 -18,-250" fill={`url(#${id}p)`} transform="rotate(180)" />
      </g>
    </g>
  );
  if (skin === "quasar" && layer === "back") return (
    <g aria-hidden="true" className="sky-skin-pulse">
      <defs><linearGradient id={`${id}q`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#7FA6FF" stopOpacity=".9" /><stop offset="1" stopColor="#B78CFF" stopOpacity="0" /></linearGradient></defs>
      <polygon points="-7,0 7,0 3,-270 -3,-270" fill={`url(#${id}q)`} />
      <polygon points="-7,0 7,0 3,-270 -3,-270" fill={`url(#${id}q)`} transform="rotate(180)" />
    </g>
  );
  if (skin === "binary" && layer === "back") return (
    <g aria-hidden="true">
      <circle r="98" fill="none" stroke="var(--sky-glow)" strokeOpacity=".35" strokeDasharray="2 6" />
      <g className="sky-skin-spin">
        <circle cx="98" cy="0" r="14" fill="var(--sky-glow)" fillOpacity=".2" />
        <circle cx="98" cy="0" r="7.5" fill="var(--sky-glow)" />
      </g>
    </g>
  );
  if (skin === "ringed" || skin === "horizon") {
    const disk = skin === "horizon";
    const ring = (
      <>
        <defs>
          <linearGradient id={`${id}r`} x1="0" x2="1">
            <stop offset="0" stopColor={disk ? "#E8643F" : "#C9B48A"} /><stop offset=".5" stopColor={disk ? "#FFD08A" : "#EADBB8"} /><stop offset="1" stopColor={disk ? "#E8643F" : "#C9B48A"} />
          </linearGradient>
          <clipPath id={`${id}k`}><rect x="-200" y="0" width="400" height="80" /></clipPath>
        </defs>
        <ellipse rx={disk ? 112 : 104} ry={disk ? 24 : 20} fill="none" stroke={`url(#${id}r)`} strokeWidth={disk ? 11 : 4} strokeOpacity={disk ? 0.95 : 0.85} />
      </>
    );
    return layer === "back" ? (
      <g aria-hidden="true">
        {disk && <circle r="60" fill="#E8643F" fillOpacity=".16" />}
        <g transform="rotate(-16)">{ring}</g>
      </g>
    ) : (
      <g aria-hidden="true">
        {disk && <circle r="46.5" fill="none" stroke="#FFE2B0" strokeWidth="2" />}
        <g transform="rotate(-16)"><g clipPath={`url(#${id}k)`}>{ring}</g></g>
      </g>
    );
  }
  return null;
}

// A small square preview of one skin for the Skins panel.
export function SkinPreview({ kind, id }) {
  return (
    <svg viewBox={kind === "sky" ? "-300 -300 600 600" : "-150 -150 300 300"} className={`sky-skin-preview${id === "horizon" ? " is-horizon" : ""}`} aria-hidden="true">
      <rect x="-300" y="-300" width="600" height="600" className="sky-skin-preview-bg" />
      {kind === "sky" ? (
        <>
          <SkyBackdrop skin={id} />
          {seeded(5, 40, (r) => [r() * 600 - 300, r() * 600 - 300, 2 + r() * 3]).map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="var(--star)" fillOpacity=".5" />)}
          <circle r="40" className="sky-skin-preview-core" />
        </>
      ) : (
        <>
          <CoreSkin skin={id} layer="back" />
          <circle r="44" className="sky-skin-preview-core" />
          <CoreSkin skin={id} layer="front" />
        </>
      )}
    </svg>
  );
}
