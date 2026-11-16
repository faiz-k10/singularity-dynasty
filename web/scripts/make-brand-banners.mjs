// Renders the social banners into brand/ AND web/public/brand/: a black hole's event horizon on the site's paper (light) and void (dark), 3000 x 1000 (3:1 = the X header at 2x;
// the subject is centred and everything important sits inside the middle 1500 x 420 so YouTube / Facebook / LinkedIn crops keep it). No text, so each platform can overlay its own.
// Run from web/: node scripts/make-brand-banners.mjs

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { MARK_DS, MARK_DISC, MARK_DISC_DS } from "../lib/brandMark.js";

const W = 3000, H = 1000, CX = W / 2, CY = H / 2, R = 175; // R = the event horizon's radius
const themes = {
  light: { bg: "#ECE7DC", hole: "#0B0B0B", ring: "#AE3516", warm: "#C8401E", cold: "#1F4FC4", star: "#121212", orbit: "#121212", letters: "#ECE7DC", starAlpha: 0.5, orbitAlpha: 0.2 },
  dark: { bg: "#0B0B0B", hole: "#000000", ring: "#ECE7DC", warm: "#E8643F", cold: "#4C7DF0", star: "#ECE7DC", orbit: "#ECE7DC", letters: "#ECE7DC", starAlpha: 0.8, orbitAlpha: 0.17 },
};

// A football seen side-on: two cubic curves meeting in blunted points (a fuller belly than a plain lens), a = half its length, b = half its height, plus the two stripes near each
// end. The top edge is y(x) = b * 1.35 * 3u(1-u)... sampled from the same cubic so the stripes end exactly on the outline.
const KX = 0.58, KY = 1.4; // the cubic's control points: x at +-KX * a, y at KY * b
const edge = (a, b, x) => { // the outline's half-height at distance x from the centre
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, px = -a * (1 - m) ** 3 + 3 * (1 - m) ** 2 * m * -KX * a + 3 * (1 - m) * m * m * KX * a + m ** 3 * a; (px < x ? (lo = m) : (hi = m)); }
  const u = (lo + hi) / 2; return 3 * (1 - u) * u * ((1 - u) + u) * KY * b;
};
const football = (a, b, stripes = true) => {
  const body = `M${CX - a} ${CY}C${CX - KX * a} ${CY - KY * b} ${CX + KX * a} ${CY - KY * b} ${CX + a} ${CY}C${CX + KX * a} ${CY + KY * b} ${CX - KX * a} ${CY + KY * b} ${CX - a} ${CY}Z`;
  if (!stripes) return body;
  let s = body;
  for (const side of [-1, 1]) for (const f of [0.64, 0.73]) {
    const x = side * f * a, y = edge(a, b, x), bow = side * 0.03 * a; // the stripe wraps the ball, so it bows a little toward the tip
    s += `M${(CX + x).toFixed(1)} ${(CY - y).toFixed(1)}Q${(CX + x + bow).toFixed(1)} ${CY} ${(CX + x).toFixed(1)} ${(CY + y).toFixed(1)}`;
  }
  return s;
};

// A small fixed random stream so both banners (and every re-run) have the same sky.
let seed = 20261116;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

function stars(t) {
  let out = "";
  for (let i = 0; i < 420; i++) {
    const x = rnd() * W, y = rnd() * H;
    const d = Math.hypot((x - CX) / 1.7, y - CY); // elliptical distance from the hole
    if (d < R + 70) continue; // keep the horizon's neighbourhood clear
    const far = Math.min(1, d / 700); // fewer / fainter stars right beside the hole, so the ring reads
    if (rnd() > 0.35 + 0.65 * far) continue;
    const r = rnd() < 0.06 ? 2.6 : rnd() < 0.3 ? 1.6 : 1;
    const a = (0.25 + rnd() * 0.75) * t.starAlpha * (0.55 + 0.45 * far);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${t.star}" opacity="${a.toFixed(2)}"/>`;
  }
  return out;
}

function svg(name, t) {
  // Two football outlines, no stripes, both at the thin weight the founder picked (the old outermost ring's 2.2px); the inner one in the accent colour.
  const orbits = [290, 560].map((b, i) =>
    `<path d="${football(b * 1.7, b, false)}" fill="none" stroke="${i === 0 ? t.ring : t.orbit}" stroke-opacity="${i === 0 ? 0.4 : (t.orbitAlpha * 1.3).toFixed(2)}" stroke-width="1.1" stroke-linejoin="round"/>`).join("");
  const k = R / MARK_DISC.r; // the logo's 40-unit box scaled so its disc is the event horizon
  const initials = `<g transform="translate(${CX} ${CY}) scale(${k}) translate(${-MARK_DISC.cx} ${-MARK_DISC.cy})"><path d="${MARK_DS}" transform="${MARK_DISC_DS.transform}" fill="${t.letters}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <radialGradient id="bloom" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="${t.cold}" stop-opacity="${name === "dark" ? 0.32 : 0.16}"/>
    <stop offset="0.45" stop-color="${t.cold}" stop-opacity="${name === "dark" ? 0.08 : 0.04}"/>
    <stop offset="1" stop-color="${t.cold}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="disk" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="${t.warm}" stop-opacity="0"/>
    <stop offset="0.22" stop-color="${t.warm}" stop-opacity="0.55"/>
    <stop offset="0.5" stop-color="${t.ring}" stop-opacity="1"/>
    <stop offset="0.78" stop-color="${t.cold}" stop-opacity="0.55"/>
    <stop offset="1" stop-color="${t.cold}" stop-opacity="0"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-300%" width="140%" height="700%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  <clipPath id="front"><rect x="0" y="${CY}" width="${W}" height="${H}"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="${t.bg}"/>
<ellipse cx="${CX}" cy="${CY}" rx="1250" ry="520" fill="url(#bloom)"/>
${stars(t)}
${orbits}
<!-- the glowing disk of gas, edge-on, behind the hole -->
<ellipse cx="${CX}" cy="${CY}" rx="1000" ry="30" fill="url(#disk)" filter="url(#soft)" opacity="0.9"/>
<ellipse cx="${CX}" cy="${CY}" rx="1000" ry="5" fill="url(#disk)"/>
<!-- light bent over the top and under the bottom of the hole (gravitational lensing) -->
<circle cx="${CX}" cy="${CY}" r="${R + 22}" fill="none" stroke="${t.cold}" stroke-width="16" opacity="0.5" filter="url(#glow)"/>
<circle cx="${CX}" cy="${CY}" r="${R + 14}" fill="none" stroke="${t.ring}" stroke-width="3" opacity="0.95"/>
<!-- the event horizon -->
<circle cx="${CX}" cy="${CY}" r="${R}" fill="${t.hole}"/>
<!-- the near half of the disk crossing in front of the hole (the first banner's horizon, kept exactly) -->
<g clip-path="url(#front)"><ellipse cx="${CX}" cy="${CY}" rx="1000" ry="30" fill="none" stroke="url(#disk)" stroke-width="5"/></g>
<!-- the initials, in the hole, on top of that band -->
${initials}
<!-- a speck on its way in -->
<circle cx="${CX + 330}" cy="${CY - 120}" r="5" fill="${t.warm}"/>
<circle cx="${CX + 330}" cy="${CY - 120}" r="16" fill="${t.warm}" opacity="0.25" filter="url(#soft)"/>
</svg>`;
}

for (const dir of ["../brand", "public/brand"]) await mkdir(dir, { recursive: true });
for (const [name, t] of Object.entries(themes)) {
  const png = await sharp(Buffer.from(svg(name, t))).png().toBuffer();
  for (const dir of ["../brand", "public/brand"]) await writeFile(`${dir}/banner-${name}-ds-3000x1000.png`, png);
  console.log(`banner-${name}-ds-3000x1000.png`);
}
