"use client";

import { useId } from "react";
import { skyFor } from "@/lib/nightSky";
import { StarField, Galaxies, Cloud, Spikes } from "./hubble";

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
const curtain = seeded(7, 18, (r) => r() * 600 - 300);

const glow = (id, sd) => <filter id={id} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={sd} /></filter>;
const radial = (id, stops) => <radialGradient id={id}>{stops.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a} />)}</radialGradient>;

export function SkyBackdrop({ skin }) {
  const id = useId().replace(/:/g, "");
  if (skin === "nebula") return (
    // the "Hubble palette": gold, teal and rust gas in fine filaments, a few young blue stars burning through
    <g aria-hidden="true">
      <Cloud id={`${id}a`} cx={-120} cy={-40} rx={300} ry={190} rot={-20} color="#E3A857" freq={0.009} seed={3} />
      <Cloud id={`${id}b`} cx={150} cy={120} rx={260} ry={170} rot={25} color="#2BB3A3" freq={0.011} seed={8} />
      <Cloud id={`${id}c`} cx={40} cy={-190} rx={200} ry={120} rot={10} color="#C2543A" freq={0.014} seed={13} strength={0.9} />
      <Cloud id={`${id}d`} cx={-170} cy={190} rx={180} ry={110} rot={-8} color="#5B8DEF" freq={0.012} seed={21} strength={0.85} />
      <Cloud id={`${id}e`} cx={20} cy={20} rx={240} ry={90} rot={-30} color="#05060A" freq={0.02} seed={34} strength={1.1} />
      <StarField seed={23} n={26} spikes={4} scale={1.2} />
    </g>
  );
  if (skin === "aurora") return (
    // "Pillars" (the id stays aurora): tall columns of cold dust rising into glowing teal and gold gas, their tips lit by young stars --
    // in the spirit of Hubble's Pillars of Creation
    <g aria-hidden="true">
      <defs>
        {radial(`${id}bg`, [[0, "#3FC9B4", 0.55], [0.6, "#2BB3A3", 0.25], [1, "#2BB3A3", 0]])}
        {radial(`${id}t`, [[0, "#FFE3A8", 0.9], [1, "#FFE3A8", 0]])}
      </defs>
      <ellipse cx="20" cy="-40" rx="340" ry="300" fill={`url(#${id}bg)`} />
      <Cloud id={`${id}a`} cx={40} cy={-60} rx={330} ry={260} color="#5FE0C8" freq={0.008} seed={14} strength={1} />
      <Cloud id={`${id}b`} cx={-60} cy={-150} rx={280} ry={170} rot={-10} color="#F2B860" freq={0.011} seed={19} strength={1} />
      {[[-175, 110, 52, 230, -6], [-45, 160, 40, 170, 4], [105, 200, 32, 120, 9]].map(([cx, cy, rx, ry, rot], i) => (
        <g key={i}>
          {/* the lit edge first (a slightly larger gold column), then the dark column over it */}
          <Cloud id={`${id}r${i}`} cx={cx} cy={cy - 6} rx={rx * 1.18} ry={ry * 1.04} rot={rot} color="#FFC870" freq={0.024} seed={30 + i} strength={1.1} />
          <circle cx={cx + Math.sin((rot * Math.PI) / 180) * ry * 0.9} cy={cy - ry * 0.95} r={rx * 0.8} fill={`url(#${id}t)`} />
          <Cloud id={`${id}p${i}`} cx={cx} cy={cy} rx={rx} ry={ry} rot={rot} color="#0A0603" freq={0.024} seed={30 + i} strength={1.6} />
        </g>
      ))}
      <StarField seed={41} n={18} spikes={3} scale={1.2} />
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
      <Cloud id={`${id}w`} cx={40} cy={0} rx={420} ry={90} color="#F2D3A6" freq={0.016} seed={5} strength={0.8} />
      <Cloud id={`${id}k`} cx={0} cy={6} rx={460} ry={34} color="#05060A" freq={0.03} seed={9} strength={1.2} />
      <path d="M-460 6 C -200 -24, 40 34, 460 -4" stroke="#05060A" strokeOpacity=".45" strokeWidth="10" fill="none" filter={`url(#${id}f)`} />
      {bandStars.map(([x, y, r, o], i) => <circle key={i} cx={x} cy={y} r={r} fill="var(--sky-white)" fillOpacity={o} />)}
    </g>
  );
  if (skin === "eclipse") return (
    // "Supernova" (the id stays eclipse): the glowing shell of a star that exploded -- ember and teal filaments around a hollow centre
    <g aria-hidden="true">
      <Cloud id={`${id}a`} rx={250} ry={235} color="#E8643F" freq={0.02} seed={5} strength={1.05} />
      <Cloud id={`${id}b`} rx={230} ry={215} rot={30} color="#2BB3A3" freq={0.026} seed={9} strength={0.95} />
      <Cloud id={`${id}c`} rx={210} ry={195} color="#FFE3A8" freq={0.04} seed={15} strength={0.9} />
      <defs>{radial(`${id}v`, [[0, "#020306", 1], [0.55, "#020306", 0.92], [0.75, "#020306", 0.35], [1, "#020306", 0]])}</defs>
      <circle r="190" fill={`url(#${id}v)`} />
      <StarField seed={52} n={20} spikes={2} scale={1.2} />
    </g>
  );
  if (String(skin).startsWith("season-")) {
    // the season's Singularity constellation drawn huge across the sky, each of its stars a real star: a halo and diffraction spikes
    const g = seasonGhost(skin);
    return (
      <g aria-hidden="true">
        <defs>
          <radialGradient id={`${id}s`}><stop offset="0" style={{ stopColor: "var(--sky-gold)" }} stopOpacity=".22" /><stop offset="1" style={{ stopColor: "var(--sky-gold)" }} stopOpacity="0" /></radialGradient>
          <radialGradient id={`${id}h`}><stop offset="0" style={{ stopColor: "var(--sky-t-gold)" }} stopOpacity=".75" /><stop offset=".35" style={{ stopColor: "var(--sky-gold)" }} stopOpacity=".2" /><stop offset="1" style={{ stopColor: "var(--sky-gold)" }} stopOpacity="0" /></radialGradient>
        </defs>
        <circle r="300" fill={`url(#${id}s)`} />
        {g.edges.map(([i, j]) => <line key={`${i}-${j}`} x1={g.pts[i][0]} y1={g.pts[i][1]} x2={g.pts[j][0]} y2={g.pts[j][1]} style={{ stroke: "var(--sky-gold)" }} strokeOpacity=".4" strokeWidth="2" />)}
        {g.pts.map(([x, y, r], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r * 4} fill={`url(#${id}h)`} />
            <circle cx={x} cy={y} r={r * 0.7} style={{ fill: "var(--sky-t-gold)" }} />
            <Spikes x={x} y={y} len={r * 6} color="var(--sky-t-gold)" width={1} opacity={0.75} />
          </g>
        ))}
      </g>
    );
  }
  return null; // deep field: the plain sky
}

// layer "back" sits behind the core's body, "front" in front of it (rings and disks pass in front on their near side). Hubble-style (Nov 11
// 2026, founder): textured gas from the Cloud filter, real-looking stars with halos and diffraction spikes, fine ring and disk structure.
// Nothing that carries the turbulence filter is inside a spinning / pulsing group (it would re-render every frame).
export function CoreSkin({ skin, layer }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const halo = (key, color, r, a = 0.6) => (
    <>
      <defs>{radial(`${id}${key}`, [[0, color, a], [0.35, color, a * 0.3], [1, color, 0]])}</defs>
      <circle r={r} fill={`url(#${id}${key})`} />
    </>
  );
  const lower = <defs><clipPath id={`${id}k`}><rect x="-260" y="0" width="520" height="140" /></clipPath></defs>;

  if (skin === "pulsar") {
    if (layer !== "back") return null;
    // the Crab: a pulsar inside its wind nebula -- teal and violet gas, rust filaments -- with two soft lighthouse beams
    return (
      <g aria-hidden="true">
        <Cloud id={`${id}a`} rx={170} ry={120} rot={-25} color="#5BC0D8" freq={0.016} seed={4} />
        <Cloud id={`${id}b`} rx={150} ry={110} rot={30} color="#B86BD8" freq={0.02} seed={11} strength={0.9} />
        <Cloud id={`${id}c`} rx={175} ry={130} rot={10} color="#D9603B" freq={0.035} seed={17} strength={1.15} />
        {halo("h", "#CFE0FF", 95, 0.65)}
        <defs><linearGradient id={`${id}p`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#F4F8FF" stopOpacity=".9" /><stop offset=".35" stopColor="#9CC2FF" stopOpacity=".35" /><stop offset="1" stopColor="#9CC2FF" stopOpacity="0" /></linearGradient></defs>
        <g className="sky-skin-spin is-slow">
          <polygon points="-4,0 4,0 22,-250 -22,-250" fill={`url(#${id}p)`} />
          <polygon points="-4,0 4,0 22,-250 -22,-250" fill={`url(#${id}p)`} transform="rotate(180)" />
        </g>
      </g>
    );
  }

  if (skin === "ringed") {
    // Saturn as Hubble shows it: many fine rings in cream and tan, the dark Cassini gap, the far half behind the body, the near half in front
    const rings = [[86, 0.35, "#8C7350"], [92, 0.55, "#C9AE7E"], [98, 0.85, "#EAD9B2"], [104, 0.9, "#F2E2BC"], [110, 0.75, "#D8C194"], [121, 0.65, "#CDB487"], [127, 0.45, "#B89C6C"], [132, 0.25, "#8C7350"]];
    const set = (
      <g transform="rotate(-16)">
        {rings.map(([rx, a, c], i) => <ellipse key={i} rx={rx} ry={rx * 0.21} fill="none" stroke={c} strokeOpacity={a} strokeWidth={i === 3 ? 6 : 4.5} />)}
      </g>
    );
    return layer === "back" ? <g aria-hidden="true">{set}</g> : <g aria-hidden="true">{lower}<g clipPath={`url(#${id}k)`}>{set}</g></g>;
  }

  if (skin === "binary") {
    if (layer !== "back") return null;
    // a close binary: a hot companion star (halo, spikes) feeding a glowing stream of gas into a disk around the core
    return (
      <g aria-hidden="true">
        <defs>
          {radial(`${id}s`, [[0, "#FFE8C2", 0.95], [0.3, "#FFB86B", 0.45], [1, "#FFB86B", 0]])}
          <linearGradient id={`${id}g`} x1="1" y1="0" x2="0" y2="0"><stop offset="0" stopColor="#FFD9A8" stopOpacity=".9" /><stop offset="1" stopColor="#FFFFFF" stopOpacity=".2" /></linearGradient>
        </defs>
        <circle r="110" fill="none" stroke="#FFB86B" strokeOpacity=".22" strokeDasharray="2 8" />
        <g transform="rotate(-8)"><ellipse rx="66" ry="14" fill="none" stroke="#FFC98C" strokeOpacity=".55" strokeWidth="5" /></g>
        <g className="sky-skin-spin">
          <path d="M 110 0 C 90 -38, 55 -46, 30 -20" fill="none" stroke={`url(#${id}g)`} strokeWidth="7" strokeLinecap="round" opacity=".7" />
          <circle cx="110" cy="0" r="34" fill={`url(#${id}s)`} />
          <circle cx="110" cy="0" r="10" fill="#FFF4E0" />
          <Spikes x={110} y={0} len={34} color="#FFE8C2" width={1} opacity={0.8} />
        </g>
      </g>
    );
  }

  if (skin === "quasar") {
    if (layer === "front") return <g aria-hidden="true" transform="rotate(-8)">{lower}<ellipse rx="80" ry="13" fill="none" stroke="#C4A6FF" strokeWidth="5" strokeOpacity=".9" clipPath={`url(#${id}k)`} /></g>;
    // a quasar in its host galaxy: a warm elliptical glow, jets of knots shooting out of both poles, a violet disk, a spiked point of light
    const knots = [60, 95, 128, 165, 205, 248];
    return (
      <g aria-hidden="true">
        <Cloud id={`${id}g`} rx={190} ry={95} rot={-30} color="#F2C894" freq={0.02} seed={6} strength={0.75} />
        {halo("h", "#B78CFF", 110, 0.55)}
        <defs>{radial(`${id}n`, [[0, "#EAF0FF", 0.95], [0.4, "#8FB0FF", 0.5], [1, "#8FB0FF", 0]])}</defs>
        <line x1="0" y1="-270" x2="0" y2="270" stroke="#9CB8FF" strokeOpacity=".35" strokeWidth="2" />
        <g className="sky-skin-pulse">
          {knots.flatMap((d, i) => [1, -1].map((side) => <circle key={`${i}${side}`} cx={0} cy={side * d} r={11 - i * 1.2} fill={`url(#${id}n)`} />))}
        </g>
        <g transform="rotate(-8)"><ellipse rx="80" ry="13" fill="none" stroke="#C4A6FF" strokeWidth="5" strokeOpacity=".9" /></g>
      </g>
    );
  }

  if (skin === "horizon") {
    // a black hole: a turbulent accretion disk of ember and gold gas, its far side bent up over the hole by gravity, a thin photon ring
    const disk = (k) => (
      <g transform="rotate(-12)">
        <Cloud id={`${id}${k}1`} rx={150} ry={34} color="#FF8A3D" freq={0.03} seed={7} strength={1.25} />
        <Cloud id={`${id}${k}2`} rx={118} ry={24} color="#FFE2A8" freq={0.045} seed={12} strength={1.1} />
      </g>
    );
    if (layer === "back") return (
      <g aria-hidden="true">
        {halo("h", "#E8643F", 135, 0.45)}
        {disk("b")}
        <path d="M -62 -8 C -58 -86, 58 -86, 62 -8" fill="none" stroke="#FFD08A" strokeWidth="9" strokeOpacity=".8" />
        <path d="M -62 -8 C -58 -86, 58 -86, 62 -8" fill="none" stroke="#FFF1D6" strokeWidth="2" strokeOpacity=".9" />
      </g>
    );
    return (
      <g aria-hidden="true">
        <circle r="46.5" fill="none" stroke="#FFF1D6" strokeWidth="2.5" />
        {lower}
        <g clipPath={`url(#${id}k)`}>{disk("f")}</g>
      </g>
    );
  }
  return null;
}

// A square preview of one skin for the Skins panel (always in full colour; a locked one gets a lock over it in the panel).
export function SkinPreview({ kind, id }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg viewBox={kind === "sky" ? "-300 -300 600 600" : "-160 -160 320 320"} className={`sky-skin-preview${id === "horizon" ? " is-horizon" : ""}`} aria-hidden="true">
      <defs><radialGradient id={`${gid}c`} cx=".42" cy=".4"><stop offset="0" stopColor="#FFFFFF" stopOpacity=".95" /><stop offset=".45" stopColor="#FFFFFF" stopOpacity=".25" /><stop offset=".85" stopColor="#000000" stopOpacity="0" /><stop offset="1" stopColor="#000000" stopOpacity=".22" /></radialGradient></defs>
      <rect x="-300" y="-300" width="600" height="600" className="sky-skin-preview-bg" />
      {kind === "sky" ? <><Galaxies id={gid} seed={31} n={8} scale={1.6} /><StarField seed={5} n={70} spikes={3} scale={1.6} /></> : <StarField seed={5} n={40} span={320} spikes={2} scale={0.9} />}
      {kind === "sky" ? (
        <>
          <SkyBackdrop skin={id} />
          <circle r="40" className="sky-skin-preview-core" />
          <circle r="40" className="sky-core-shine" fill={`url(#${gid}c)`} />
        </>
      ) : (
        <>
          <CoreSkin skin={id} layer="back" />
          <circle r="44" className="sky-skin-preview-core" />
          {id !== "horizon" && <circle r="44" className="sky-core-shine" fill={`url(#${gid}c)`} />}
          <CoreSkin skin={id} layer="front" />
        </>
      )}
    </svg>
  );
}
