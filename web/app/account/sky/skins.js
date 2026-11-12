"use client";

import { useId } from "react";
import { skyFor } from "@/lib/nightSky";

// The Night Sky's skins (rules, unlocks, rarity and progress: SKINS in lib/nightSky.js). Drawn in the sky's own coordinates (-300..300, the
// core at 0,0, its body r 44, the gauge r 74-84) so the same pieces serve the sky and the previews in the Skins panel. Cosmetic art, so the
// colours are fixed like the badge art (the season skin and the band follow the theme); every animation stops for reduced motion
// (.sky-skin-* in globals.css). Redrawn Nov 11 2026 (founder: "make the skins more exciting"): brighter, layered, with glows.

// A season skin's art: that season's Singularity constellation drawn huge across the whole sky (shared with the share cards).
export function seasonGhost(skin) {
  const y = Number(String(skin).slice(7)), c = skyFor(y)[3];
  const cx = c.pts.reduce((a, p) => a + p[0], 0) / c.pts.length, cy = c.pts.reduce((a, p) => a + p[1], 0) / c.pts.length;
  return { pts: c.pts.map(([x, py, r]) => [(x - cx) * 2.6, (py - cy) * 2.6, r * 2]), edges: c.edges };
}

const seeded = (seed, n, f) => { let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); return Array.from({ length: n }, () => f(r)); };
const bandStars = seeded(11, 320, (r) => { const along = r() * 900 - 450, across = (r() + r() + r() - 1.5) * 70; return [along, across, 0.3 + r() * 0.9, 0.25 + r() * 0.6]; });
const nebulaStars = seeded(23, 14, (r) => [r() * 520 - 260, r() * 520 - 260, 1.5 + r() * 2.5]);
const curtain = seeded(7, 18, (r) => r() * 600 - 300);
const field = seeded(5, 40, (r) => [r() * 600 - 300, r() * 600 - 300, 1.5 + r() * 2.5]);

const glow = (id, sd) => <filter id={id} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={sd} /></filter>;
const radial = (id, stops) => <radialGradient id={id}>{stops.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a} />)}</radialGradient>;

export function SkyBackdrop({ skin }) {
  const id = useId().replace(/:/g, "");
  if (skin === "nebula") return (
    <g aria-hidden="true">
      <defs>
        {radial(`${id}a`, [[0, "#8B5CF6", 0.62], [0.55, "#8B5CF6", 0.22], [1, "#8B5CF6", 0]])}
        {radial(`${id}b`, [[0, "#14B8A6", 0.62], [0.55, "#14B8A6", 0.22], [1, "#14B8A6", 0]])}
        {radial(`${id}c`, [[0, "#EC4899", 0.62], [0.55, "#EC4899", 0.22], [1, "#EC4899", 0]])}
        {radial(`${id}d`, [[0, "#3B82F6", 0.62], [0.55, "#3B82F6", 0.22], [1, "#3B82F6", 0]])}
        {glow(`${id}f`, 6)}
      </defs>
      <g className="sky-skin-drift">
        <ellipse cx="-140" cy="-40" rx="260" ry="160" fill={`url(#${id}a)`} transform="rotate(-20 -140 -40)" />
        <ellipse cx="170" cy="140" rx="240" ry="150" fill={`url(#${id}b)`} transform="rotate(25 170 140)" />
        <ellipse cx="80" cy="-200" rx="170" ry="100" fill={`url(#${id}c)`} />
        <ellipse cx="-180" cy="200" rx="150" ry="90" fill={`url(#${id}d)`} />
      </g>
      {nebulaStars.map(([x, y, r], i) => <g key={i}><circle cx={x} cy={y} r={r * 3} fill="#FFFFFF" fillOpacity=".25" filter={`url(#${id}f)`} /><circle cx={x} cy={y} r={r} fill="#FFFFFF" /></g>)}
    </g>
  );
  if (skin === "aurora") return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" x2="1"><stop offset="0" stopColor="#22E58A" stopOpacity="0" /><stop offset=".25" stopColor="#22E58A" /><stop offset=".6" stopColor="#22D3EE" /><stop offset="1" stopColor="#A855F7" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22E58A" stopOpacity="0" /><stop offset=".5" stopColor="#22E58A" stopOpacity=".5" /><stop offset="1" stopColor="#A855F7" stopOpacity="0" /></linearGradient>
        {glow(`${id}f`, 12)}
      </defs>
      <g className="sky-skin-drift" filter={`url(#${id}f)`} opacity=".85">
        <path d="M-320 -160 C -160 -260, -10 -90, 320 -210" stroke={`url(#${id}g)`} strokeWidth="56" fill="none" />
        <path d="M-320 -90 C -120 -180, 60 -40, 320 -140" stroke={`url(#${id}g)`} strokeWidth="30" fill="none" opacity=".75" />
        <path d="M-320 -20 C -100 -90, 120 10, 320 -70" stroke={`url(#${id}g)`} strokeWidth="18" fill="none" opacity=".5" />
      </g>
      <g className="sky-skin-pulse" opacity=".35">{curtain.map((x, i) => <rect key={i} x={x} y="-280" width="6" height="200" fill={`url(#${id}v)`} />)}</g>
    </g>
  );
  if (skin === "milkyway") return (
    <g aria-hidden="true" transform="rotate(-32)">
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: "var(--sky-band)" }} stopOpacity="0" /><stop offset=".5" style={{ stopColor: "var(--sky-band)" }} stopOpacity=".32" /><stop offset="1" style={{ stopColor: "var(--sky-band)" }} stopOpacity="0" /></linearGradient>
        {radial(`${id}c`, [[0, "#F5C38A", 0.5], [1, "#F5C38A", 0]])}
        {glow(`${id}f`, 8)}
      </defs>
      <rect x="-460" y="-100" width="920" height="200" fill={`url(#${id}m)`} />
      <ellipse cx="60" cy="0" rx="200" ry="70" fill={`url(#${id}c)`} />
      <path d="M-460 6 C -200 -24, 40 34, 460 -4" stroke="#05060A" strokeOpacity=".55" strokeWidth="14" fill="none" filter={`url(#${id}f)`} />
      {bandStars.map(([x, y, r, o], i) => <circle key={i} cx={x} cy={y} r={r} fill="var(--sky-white)" fillOpacity={o} />)}
    </g>
  );
  if (skin === "eclipse") return (
    <g aria-hidden="true">
      <defs>
        {radial(`${id}e`, [[0.2, "#B3261E", 0], [0.6, "#B3261E", 0.5], [1, "#B3261E", 0.6]])}
        {radial(`${id}c`, [[0.36, "#FFE6B0", 0], [0.42, "#FFE6B0", 0.95], [0.55, "#F2B04A", 0.5], [1, "#F2B04A", 0]])}
        {glow(`${id}f`, 6)}
      </defs>
      <circle r="520" fill={`url(#${id}e)`} />
      <circle r="140" fill={`url(#${id}c)`} className="sky-skin-pulse" />
      {/* the "diamond ring": the last bead of light at the edge of the eclipse */}
      <circle cx="40" cy="-40" r="10" fill="#FFFFFF" filter={`url(#${id}f)`} />
      <circle cx="40" cy="-40" r="4" fill="#FFFFFF" />
    </g>
  );
  if (String(skin).startsWith("season-")) {
    const g = seasonGhost(skin);
    return (
      <g aria-hidden="true">
        <defs>
          <radialGradient id={`${id}s`}><stop offset="0" style={{ stopColor: "var(--sky-gold)" }} stopOpacity=".3" /><stop offset="1" style={{ stopColor: "var(--sky-gold)" }} stopOpacity="0" /></radialGradient>
          {glow(`${id}f`, 7)}
        </defs>
        <circle r="300" fill={`url(#${id}s)`} />
        {g.edges.map(([i, j]) => <line key={`${i}-${j}`} x1={g.pts[i][0]} y1={g.pts[i][1]} x2={g.pts[j][0]} y2={g.pts[j][1]} style={{ stroke: "var(--sky-gold)" }} strokeOpacity=".55" strokeWidth="3" />)}
        {g.pts.map(([x, y, r], i) => <g key={i}><circle cx={x} cy={y} r={r * 2.4} style={{ fill: "var(--sky-gold)" }} fillOpacity=".45" filter={`url(#${id}f)`} /><circle cx={x} cy={y} r={r} style={{ fill: "var(--sky-gold)" }} /></g>)}
      </g>
    );
  }
  return null; // deep field: the plain sky
}

// layer "back" sits behind the core's body, "front" in front of it (rings and disks pass in front on their near side).
export function CoreSkin({ skin, layer }) {
  const id = useId().replace(/:/g, "");
  if (skin === "pulsar" && layer === "back") return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#E0ECFF" stopOpacity=".95" /><stop offset=".4" stopColor="#7FB0FF" stopOpacity=".55" /><stop offset="1" stopColor="#7FB0FF" stopOpacity="0" /></linearGradient>
        {glow(`${id}f`, 6)}
        {radial(`${id}h`, [[0, "#9CC2FF", 0.7], [1, "#9CC2FF", 0]])}
      </defs>
      <circle r="90" fill={`url(#${id}h)`} />
      <g className="sky-skin-spin is-slow">
        <g filter={`url(#${id}f)`}>
          <polygon points="-8,0 8,0 30,-260 -30,-260" fill={`url(#${id}p)`} />
          <polygon points="-8,0 8,0 30,-260 -30,-260" fill={`url(#${id}p)`} transform="rotate(180)" />
        </g>
        <polygon points="-3,0 3,0 10,-260 -10,-260" fill={`url(#${id}p)`} />
        <polygon points="-3,0 3,0 10,-260 -10,-260" fill={`url(#${id}p)`} transform="rotate(180)" />
      </g>
    </g>
  );
  if (skin === "quasar") {
    if (layer === "front") return (
      <g aria-hidden="true" transform="rotate(-8)">
        <defs><clipPath id={`${id}k`}><rect x="-200" y="0" width="400" height="80" /></clipPath></defs>
        <ellipse rx="86" ry="14" fill="none" stroke="#C4A6FF" strokeWidth="6" strokeOpacity=".9" clipPath={`url(#${id}k)`} />
      </g>
    );
    return (
      <g aria-hidden="true">
        <defs>
          <linearGradient id={`${id}q`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#FFFFFF" stopOpacity=".95" /><stop offset=".3" stopColor="#7FA6FF" stopOpacity=".85" /><stop offset="1" stopColor="#B78CFF" stopOpacity="0" /></linearGradient>
          {glow(`${id}f`, 8)}
          {radial(`${id}h`, [[0, "#B78CFF", 0.6], [1, "#B78CFF", 0]])}
        </defs>
        <circle r="100" fill={`url(#${id}h)`} />
        <g className="sky-skin-pulse">
          <g filter={`url(#${id}f)`}>
            <polygon points="-12,0 12,0 6,-285 -6,-285" fill={`url(#${id}q)`} />
            <polygon points="-12,0 12,0 6,-285 -6,-285" fill={`url(#${id}q)`} transform="rotate(180)" />
          </g>
          <polygon points="-4,0 4,0 2,-285 -2,-285" fill={`url(#${id}q)`} />
          <polygon points="-4,0 4,0 2,-285 -2,-285" fill={`url(#${id}q)`} transform="rotate(180)" />
        </g>
        <g transform="rotate(-8)"><ellipse rx="86" ry="14" fill="none" stroke="#C4A6FF" strokeWidth="6" strokeOpacity=".9" /></g>
      </g>
    );
  }
  if (skin === "binary" && layer === "back") return (
    <g aria-hidden="true">
      <defs>{radial(`${id}h`, [[0, "#FFB86B", 0.75], [1, "#FFB86B", 0]])}</defs>
      <circle r="104" fill="none" stroke="#FFB86B" strokeOpacity=".35" strokeDasharray="3 7" />
      <g className="sky-skin-spin">
        <path d="M 104 0 A 104 104 0 0 0 52 -90" fill="none" stroke="#FFB86B" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
        <circle cx="104" cy="0" r="26" fill={`url(#${id}h)`} />
        <circle cx="104" cy="0" r="11" fill="#FFD9A8" />
        <circle cx="100" cy="-4" r="4" fill="#FFFFFF" />
      </g>
    </g>
  );
  if (skin === "ringed" || skin === "horizon") {
    const disk = skin === "horizon";
    const rings = (
      <>
        <defs>
          <linearGradient id={`${id}r`} x1="0" x2="1">
            <stop offset="0" stopColor={disk ? "#C2410C" : "#B9965E"} /><stop offset=".5" stopColor={disk ? "#FFE2A8" : "#F2E2BC"} /><stop offset="1" stopColor={disk ? "#C2410C" : "#B9965E"} />
          </linearGradient>
          <clipPath id={`${id}k`}><rect x="-200" y="0" width="400" height="80" /></clipPath>
        </defs>
        {disk ? (
          <>
            <ellipse rx="122" ry="27" fill="none" stroke={`url(#${id}r)`} strokeWidth="16" strokeOpacity=".9" />
            <ellipse rx="100" ry="21" fill="none" stroke="#FFF1D6" strokeWidth="3" strokeOpacity=".8" />
          </>
        ) : (
          <>
            <ellipse rx="122" ry="25" fill="none" stroke={`url(#${id}r)`} strokeWidth="9" strokeOpacity=".75" />
            <ellipse rx="104" ry="21" fill="none" stroke={`url(#${id}r)`} strokeWidth="5" strokeOpacity=".95" />
            <ellipse rx="92" ry="18" fill="none" stroke="#E8D6AE" strokeWidth="2" strokeOpacity=".6" />
          </>
        )}
      </>
    );
    if (layer === "back") return (
      <g aria-hidden="true">
        {disk && (
          <>
            <defs>{radial(`${id}h`, [[0.3, "#E8643F", 0.55], [1, "#E8643F", 0]])}</defs>
            <circle r="120" fill={`url(#${id}h)`} />
            {/* the far side of the disk, bent over the top of the hole by its gravity */}
            <path d="M -66 -10 C -60 -88, 60 -88, 66 -10" fill="none" stroke="#FFD08A" strokeWidth="10" strokeOpacity=".85" />
          </>
        )}
        <g transform="rotate(-16)">{rings}</g>
      </g>
    );
    return (
      <g aria-hidden="true">
        {disk && <circle r="46.5" fill="none" stroke="#FFF1D6" strokeWidth="2.5" />}
        <g transform="rotate(-16)"><g clipPath={`url(#${id}k)`}>{rings}</g></g>
      </g>
    );
  }
  return null;
}

// A square preview of one skin for the Skins panel (always in full colour; a locked one gets a lock over it in the panel).
export function SkinPreview({ kind, id }) {
  return (
    <svg viewBox={kind === "sky" ? "-300 -300 600 600" : "-160 -160 320 320"} className={`sky-skin-preview${id === "horizon" ? " is-horizon" : ""}`} aria-hidden="true">
      <rect x="-300" y="-300" width="600" height="600" className="sky-skin-preview-bg" />
      {field.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="var(--star)" fillOpacity=".45" />)}
      {kind === "sky" ? (
        <>
          <SkyBackdrop skin={id} />
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
