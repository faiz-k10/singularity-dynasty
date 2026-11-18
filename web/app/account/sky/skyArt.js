"use client";

import { renderToStaticMarkup } from "react-dom/server";
import { FAMILIES, COLOURS, skyFor, seasonProgress, COLORS as STAR } from "@/lib/nightSky";
import { SkyBackdrop, CoreSkin } from "./skins";
import { placeFind } from "@/lib/skyPlacement";
import { StarField, Galaxies, Scrim, LitStar, GlowLine, Bloom, StarSurface } from "./hubble";

// The Night Sky's pictures (from mockups/night-sky.html, which the founder approved): one renderer per kind of object, coloured by the find's
// colour and finished by its version, drawn on a canvas; the telescope reveal (the picture sharpens out of noise); and the share cards.
// `bare`: the object alone on a transparent canvas (no field behind it), for placing it in the member's own sky.
// The objects are drawn in the core's language (Nov 17 2026, founder: "make the designs a bit more polished ... match the art to the style of
// the core"): every body is a SPHERE with a hot centre falling off to a darker limb, a soft noise texture (like the core's granulation), a
// glow, and -- for anything lit by a star rather than shining itself -- a soft night side and an atmosphere rim. No hard strokes, no
// diffraction spikes, no random lines; comets' tails run exactly along their axis (head upper right, tail toward the lower left, which
// lib/skyPlacement.js turns away from the core). The random stream is consumed in the same order every time, so a find always looks the same.
export function drawObject(ctx, W, find, edge, { bare = false } = {}) {
  const fam = FAMILIES[find.fam], pal = COLOURS.find((c) => c.id === find.colour).c, ver = find.version;
  let s = 11 + find.fam * 97; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.save();
  const C = W / 2, u = W / 320, TAU = Math.PI * 2;
  // the field behind it: a faint deep-blue vignette, stars in colour temperatures with soft halos (no spikes), a few distant galaxies
  ctx.fillStyle = "#020306"; ctx.fillRect(0, 0, W, W);
  { const g = ctx.createRadialGradient(C, C, 0, C, C, W * 0.75); g.addColorStop(0, "rgba(22,30,58,.55)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); }
  const TEMP = ["207,224,255", "244,241,234", "244,241,234", "255,227,168", "255,181,122"];
  for (let k = 0; k < 3; k++) { const x = r() * W, y = r() * W, sz = (4 + r() * 6) * u, t = r() < 0.6 ? "242,200,148" : "169,196,255"; ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 3); ctx.scale(1, 0.35 + r() * 0.4); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 2); g.addColorStop(0, `rgba(${t},.8)`); g.addColorStop(0.35, `rgba(${t},.25)`); g.addColorStop(1, `rgba(${t},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, sz * 2, 0, TAU); ctx.fill(); ctx.restore(); }
  const n = Math.round(W * 0.45);
  for (let i = 0; i < n; i++) {
    const m = Math.pow(r(), 3.2), x = r() * W, y = r() * W, t = TEMP[Math.floor(r() * TEMP.length)], rad = (0.35 + m * 1.6) * u;
    if (m > 0.4) { const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 5); g.addColorStop(0, `rgba(${t},.5)`); g.addColorStop(1, `rgba(${t},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad * 5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = `rgba(${t},${0.35 + m * 0.65})`; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }
  if (bare) ctx.clearRect(0, 0, W, W); // the field above still ran, so the object's own details come out the same as in its thumbnail
  if (edge) { const g = ctx.createRadialGradient(W - 8 * u, 24 * u, 2, W - 8 * u, 24 * u, 90 * u); g.addColorStop(0, "rgba(233,196,106,.9)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); }

  // ---- colour and light helpers ----
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0], LT = hex(pal[0]), DK = hex(pal[1]);
  const glow = (x, y, rad, c, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, rgba(c, a)); g.addColorStop(0.4, rgba(c, a * 0.35)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill(); };
  // soft value noise (a small random grid scaled up smoothly), used as surface texture like the core's granulation
  const noise = (cells, px) => {
    const sm = document.createElement("canvas"); sm.width = sm.height = cells;
    const sc = sm.getContext("2d"), img = sc.createImageData(cells, cells);
    for (let i = 0; i < cells * cells; i++) { const v = Math.floor(r() * 255); img.data.set([v, v, v, 255], i * 4); }
    sc.putImageData(img, 0, 0);
    const big = document.createElement("canvas"); big.width = big.height = Math.max(8, Math.round(px));
    const bc = big.getContext("2d"); bc.imageSmoothingEnabled = true; bc.imageSmoothingQuality = "high"; bc.drawImage(sm, 0, 0, big.width, big.height);
    return big;
  };
  const withClip = (path, fn) => { ctx.save(); ctx.clip(path); fn(); ctx.restore(); };
  const texture = (path, x, y, rad, cells, alpha, sx = 1) => withClip(path, () => {
    ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = alpha;
    ctx.drawImage(noise(cells, rad * 2), x - rad * sx, y - rad, rad * 2 * sx, rad * 2);
    ctx.globalAlpha = alpha * 0.6; ctx.drawImage(noise(cells * 3, rad * 2), x - rad, y - rad, rad * 2, rad * 2);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  });
  const disc = (x, y, rad) => { const p = new Path2D(); p.arc(x, y, rad, 0, TAU); return p; };
  // a body lit from the upper left: glow, limb-darkened body, texture, atmosphere rim, soft night side, a gentle highlight
  const sphere = (x, y, rad, { light = LT, dark = DK, cells = 9, tex = 0.4, sx = 1, atmo = 0.35, night = 0.72, halo = 0.22 } = {}) => {
    const p = disc(x, y, rad);
    if (halo) glow(x, y, rad * 1.55, light, halo);
    const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.35, 0, x - rad * 0.1, y - rad * 0.1, rad * 1.15);
    g.addColorStop(0, rgba(mix(light, WHITE, 0.3))); g.addColorStop(0.45, rgba(light)); g.addColorStop(0.8, rgba(mix(light, dark, 0.65))); g.addColorStop(1, rgba(dark));
    ctx.fillStyle = g; ctx.fill(p);
    if (tex) texture(p, x, y, rad, cells, tex, sx);
    if (atmo) withClip(p, () => { const a = ctx.createRadialGradient(x, y, rad * 0.82, x, y, rad); a.addColorStop(0, rgba(light, 0)); a.addColorStop(1, rgba(mix(light, WHITE, 0.4), atmo)); ctx.fillStyle = a; ctx.fill(p); });
    if (night) withClip(p, () => { const t = ctx.createLinearGradient(x - rad * 0.7, y - rad * 0.7, x + rad * 0.85, y + rad * 0.85); t.addColorStop(0, "rgba(0,0,0,0)"); t.addColorStop(0.45, "rgba(0,0,0,.04)"); t.addColorStop(0.68, `rgba(0,0,0,${night * 0.55})`); t.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, night * 1.2)})`); ctx.fillStyle = t; ctx.fill(p); });
    withClip(p, () => glow(x - rad * 0.38, y - rad * 0.42, rad * 0.55, WHITE, 0.18));
    return p;
  };
  // a star or anything that shines itself, drawn like the core: white-hot centre, limb darkening, granulation, corona
  const sun = (x, y, rad, light = LT, dark = DK, corona = 2.6) => {
    glow(x, y, rad * corona, light, 0.55); glow(x, y, rad * 1.4, mix(light, WHITE, 0.5), 0.6);
    const p = disc(x, y, rad), g = ctx.createRadialGradient(x - rad * 0.12, y - rad * 0.12, 0, x, y, rad);
    g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.42, rgba(mix(light, WHITE, 0.6))); g.addColorStop(0.78, rgba(light)); g.addColorStop(1, rgba(mix(light, dark, 0.5)));
    ctx.fillStyle = g; ctx.fill(p);
    texture(p, x, y, rad, 14, 0.28);
    return p;
  };
  // an irregular rock with smooth edges, lit from the upper left, craters with a shadowed rim, a soft night side
  const rock = (x, y, sc, k = 0) => {
    const R = 46 * u * sc, N = 16, tilt = r() * TAU, pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, rr = R * (0.84 + 0.1 * Math.sin(i * 1.7 + find.fam + k) + 0.07 * Math.sin(i * 3.3 + k * 2) + (r() - 0.5) * 0.08);
      const px = Math.cos(a) * rr * 1.14, py = Math.sin(a) * rr * 0.86;
      pts.push([x + px * Math.cos(tilt) - py * Math.sin(tilt), y + px * Math.sin(tilt) + py * Math.cos(tilt)]);
    }
    const p = new Path2D(); const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    p.moveTo(...mid(pts[N - 1], pts[0])); for (let i = 0; i < N; i++) { const m2 = mid(pts[i], pts[(i + 1) % N]); p.quadraticCurveTo(pts[i][0], pts[i][1], m2[0], m2[1]); }
    glow(x, y, R * 1.7, LT, 0.1);
    const g = ctx.createRadialGradient(x - R * 0.4, y - R * 0.45, 0, x, y, R * 1.2);
    g.addColorStop(0, rgba(mix(LT, WHITE, 0.3))); g.addColorStop(0.4, rgba(LT)); g.addColorStop(0.78, rgba(mix(LT, DK, 0.7))); g.addColorStop(1, rgba(DK));
    ctx.fillStyle = g; ctx.fill(p);
    texture(p, x, y, R * 1.1, 6, 0.5);
    withClip(p, () => {
      // shallow craters: a soft shadow on the side toward the light and a faint lit rim on the far side
      for (let c = 0; c < 3; c++) { const cx = x + (r() - 0.5) * R * 0.9, cy = y + (r() - 0.5) * R * 0.7, cr = (0.1 + r() * 0.12) * R;
        const h = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, 0, cx, cy, cr); h.addColorStop(0, rgba(DK, 0.35)); h.addColorStop(0.7, rgba(DK, 0.12)); h.addColorStop(1, rgba(mix(LT, WHITE, 0.3), 0.22));
        ctx.fillStyle = h; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill(); }
      const t = ctx.createLinearGradient(x - R * 0.8, y - R * 0.8, x + R, y + R); t.addColorStop(0, "rgba(0,0,0,0)"); t.addColorStop(0.5, "rgba(0,0,0,.12)"); t.addColorStop(1, "rgba(0,0,0,.8)"); ctx.fillStyle = t; ctx.fill(p);
      withClip(p, () => glow(x - R * 0.4, y - R * 0.45, R * 0.5, WHITE, 0.15));
    });
  };
  // a comet: coma and nucleus at `head`, a curved dust tail and a straight, cooler ion tail, both centred on the axis toward the lower left
  const comet = (hx, hy, len, sc = 1) => {
    const d = [-Math.SQRT1_2, Math.SQRT1_2], q = [Math.SQRT1_2, Math.SQRT1_2], L = len * u * sc;
    const cone = (w0, w1, bend, col, alpha) => {
      const ex = hx + d[0] * L, ey = hy + d[1] * L, g = ctx.createLinearGradient(hx, hy, ex, ey);
      g.addColorStop(0, rgba(col, alpha)); g.addColorStop(0.45, rgba(col, alpha * 0.45)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(hx + q[0] * w0, hy + q[1] * w0);
      ctx.quadraticCurveTo(hx + d[0] * L * 0.5 + q[0] * (w1 * 0.6 + bend), hy + d[1] * L * 0.5 + q[1] * (w1 * 0.6 + bend), ex + q[0] * (w1 + bend), ey + q[1] * (w1 + bend));
      ctx.lineTo(ex - q[0] * (w1 - bend), ey - q[1] * (w1 - bend));
      ctx.quadraticCurveTo(hx + d[0] * L * 0.5 - q[0] * (w1 * 0.6 - bend), hy + d[1] * L * 0.5 - q[1] * (w1 * 0.6 - bend), hx - q[0] * w0, hy - q[1] * w0);
      ctx.closePath(); ctx.fill();
    };
    const ion = mix([191, 216, 255], LT, 0.25);
    for (const [w, a] of [[1.7, 0.18], [1.15, 0.3], [0.7, 0.55]]) cone(10 * u * sc * w, 34 * u * sc * w, 10 * u * sc, LT, a); // dust tail, feathered
    for (const [w, a] of [[1.4, 0.16], [0.6, 0.45]]) cone(4 * u * sc * w, 7 * u * sc * w, -3 * u * sc, ion, a); // ion tail, straight and narrow
    glow(hx, hy, 34 * u * sc, LT, 0.55); glow(hx, hy, 14 * u * sc, WHITE, 0.8);
    ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(hx, hy, 4.5 * u * sc, 0, TAU); ctx.fill();
  };

  switch (fam.shape) {
    case "rock":
      if (fam.name === "Centaur") { // half comet: a hazy coma and a few small jets of gas from its surface, but no tail
        glow(C, C, 95 * u, LT, 0.3);
        for (const a of [-2.2, -1.1, 0.4]) { const x0 = C + Math.cos(a) * 36 * u, y0 = C + Math.sin(a) * 30 * u, x1 = C + Math.cos(a) * 92 * u, y1 = C + Math.sin(a) * 80 * u, g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(mix(LT, WHITE, 0.4), 0.5)); g.addColorStop(1, rgba(LT, 0)); ctx.strokeStyle = g; ctx.lineCap = "round"; for (const w of [9, 3]) { ctx.lineWidth = w * u; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); } }
      }
      rock(C, C, fam.name === "Moonlet" ? 0.6 : fam.name.includes("Kuiper") ? 1.25 : 1); break;
    case "rubble": for (let i = 0; i < 7; i++) rock(C + Math.cos(i * 0.9) * 32 * u, C + Math.sin(i * 1.7) * 26 * u, 0.38, i); break;
    case "twin": rock(C - 30 * u, C - 6 * u, 0.78, 1); rock(C + 30 * u, C + 10 * u, 0.66, 2); break;
    case "dust": {
      ctx.save(); ctx.translate(C, C); ctx.scale(1.5, 0.6); glow(0, 0, 95 * u, LT, 0.35); ctx.restore();
      for (let i = 0; i < 260; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 90 * u, x = C + Math.cos(a) * d * 1.4, y = C + Math.sin(a) * d * 0.6, k = r(); ctx.fillStyle = rgba(mix(LT, WHITE, k * 0.5), 0.25 + k * 0.6); ctx.beginPath(); ctx.arc(x, y, (0.6 + k * 1.2) * u, 0, TAU); ctx.fill(); }
      break;
    }
    case "comet": {
      // each comet kind has its own picture, not just a different tail length (founder, Nov 17 2026: "these all look the same")
      const n = fam.name;
      if (n === "Sungrazer") { // seconds from its star: the star blazing in the corner, the tail long and brilliant, pointing straight away from it
        sun(C + 118 * u, C - 118 * u, 30 * u, mix(LT, [255, 236, 190], 0.6), DK, 3.2);
        comet(C + 52 * u, C - 52 * u, 230, 1.15);
      } else if (n === "Interstellar Comet") { // a long cigar-shaped body passing through, barely any tail (no path line: founder, Nov 17 2026)
        comet(C, C, 60, 0.55);
        ctx.save(); ctx.translate(C, C); ctx.rotate(-0.85); const g = ctx.createLinearGradient(-26 * u, -8 * u, 20 * u, 8 * u); g.addColorStop(0, rgba(mix(LT, WHITE, 0.4))); g.addColorStop(0.5, rgba(LT)); g.addColorStop(1, rgba(DK));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 26 * u, 6.5 * u, 0, 0, TAU); ctx.fill(); ctx.restore();
      } else if (n === "Main-Belt Comet") { // an ordinary asteroid that has grown a thin, straight line of dust
        ctx.lineCap = "round";
        for (const [off, w, a] of [[0, 12, 0.2], [0, 4, 0.7], [7, 2, 0.4], [-7, 2, 0.4]]) { const x0 = C + 26 * u + off * Math.SQRT1_2 * u, y0 = C - 26 * u + off * Math.SQRT1_2 * u, x1 = x0 - 150 * Math.SQRT1_2 * u, y1 = y0 + 150 * Math.SQRT1_2 * u, g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(mix(LT, WHITE, 0.3), a)); g.addColorStop(1, rgba(LT, 0)); ctx.strokeStyle = g; ctx.lineWidth = w * u; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
        rock(C + 26 * u, C - 26 * u, 0.62);
      } else if (n === "Fragmenting Comet") { // a string of pieces strung out along its orbit, each with its own small tail, in a haze of debris
        for (let i = 0; i < 60; i++) { const t = r(), x = C + 60 * u - t * 150 * u + (r() - 0.5) * 18 * u, y = C - 60 * u + t * 150 * u + (r() - 0.5) * 18 * u; ctx.fillStyle = rgba(mix(LT, WHITE, 0.3), 0.2 + r() * 0.4); ctx.beginPath(); ctx.arc(x, y, (0.6 + r()) * u, 0, TAU); ctx.fill(); }
        [[60, 0.75], [22, 0.5], [-8, 0.42], [-34, 0.32], [-56, 0.24]].forEach(([k, sc]) => comet(C + k * u, C - k * u + (k < 0 ? 6 : 0) * u, 90, sc));
      } else comet(C + 32 * u, C - 32 * u, 175, 1.05); // long-period: the classic, a bright head and a long, double tail
      break;
    }
    case "dwarf": sphere(C, C, 44 * u, { cells: 7, tex: 0.5, atmo: 0.2 }); if (fam.name.includes("Moon")) sphere(C + 72 * u, C - 42 * u, 13 * u, { tex: 0.35, atmo: 0.15 }); break;
    case "planet": sphere(C, C, 60 * u, { cells: 6, tex: 0.5, sx: 1.6 }); break;
    case "banded": {
      const p = sphere(C, C, 62 * u, { tex: 0, atmo: 0, night: 0 });
      withClip(p, () => { for (let k = -4; k <= 4; k++) { const y = C + k * 14 * u, g = ctx.createLinearGradient(0, y - 7 * u, 0, y + 7 * u); const c = k % 2 ? DK : mix(LT, WHITE, 0.25); g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.5, rgba(c, 0.45)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.fillRect(C - 70 * u, y - 7 * u, 140 * u, 14 * u); } });
      texture(p, C, C, 62 * u, 5, 0.35, 2.5);
      withClip(p, () => { const a = ctx.createRadialGradient(C, C, 62 * u * 0.82, C, C, 62 * u); a.addColorStop(0, rgba(LT, 0)); a.addColorStop(1, rgba(mix(LT, WHITE, 0.4), 0.3)); ctx.fillStyle = a; ctx.fill(p); const t = ctx.createLinearGradient(C - 43 * u, C - 43 * u, C + 53 * u, C + 53 * u); t.addColorStop(0, "rgba(0,0,0,0)"); t.addColorStop(1, "rgba(0,0,0,.72)"); ctx.fillStyle = t; ctx.fill(p); });
      break;
    }
    case "ringed": {
      const ring = (from, to) => { for (let k = 0; k < 7; k++) { const rx = (78 + k * 6) * u; ctx.strokeStyle = rgba(mix(LT, WHITE, 0.2 + (k % 3) * 0.15), k === 3 ? 0.08 : 0.42 - k * 0.03); ctx.lineWidth = (k === 3 ? 1 : 3.4) * u; ctx.beginPath(); ctx.ellipse(C, C, rx, rx * 0.27, -0.35, from, to); ctx.stroke(); } };
      ring(Math.PI, TAU); // the far half, behind the planet
      const p = sphere(C, C, 54 * u, { cells: 5, tex: 0.3, sx: 2 });
      withClip(p, () => { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(C + 6 * u, C + 12 * u, 80 * u, 9 * u, -0.35, 0, TAU); ctx.fill(); }); // the rings' shadow
      ring(0, Math.PI); // the near half, in front
      break;
    }
    case "lava": {
      const R = 58 * u, p = sphere(C, C, R, { light: mix(DK, BLACK, 0.2), dark: [12, 4, 2], tex: 0.55, cells: 8, atmo: 0, night: 0.55, halo: 0 });
      glow(C, C, R * 1.6, LT, 0.25);
      // molten seams: branching cracks that glow, following the curve of the globe instead of running straight across it
      withClip(p, () => {
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        const paths = [];
        for (let k = 0; k < 7; k++) { let x = C + (r() - 0.5) * R * 1.6, y = C + (r() - 0.5) * R * 1.6, a = r() * TAU; const pts = [[x, y]]; for (let j = 0; j < 9; j++) { a += (r() - 0.5) * 0.7; x += Math.cos(a) * R * 0.14; y += Math.sin(a) * R * 0.14; pts.push([x, y]); } paths.push(pts); }
        for (const [w, col, a] of [[7, LT, 0.18], [3.2, mix(LT, [255, 200, 90], 0.5), 0.55], [1.2, [255, 236, 170], 0.95]]) {
          ctx.strokeStyle = rgba(col, a); ctx.lineWidth = w * u;
          for (const pts of paths) { ctx.beginPath(); ctx.moveTo(...pts[0]); for (let j = 1; j < pts.length - 1; j++) ctx.quadraticCurveTo(pts[j][0], pts[j][1], (pts[j][0] + pts[j + 1][0]) / 2, (pts[j][1] + pts[j + 1][1]) / 2); ctx.lineTo(...pts[pts.length - 1]); ctx.stroke(); } // smooth, river-like seams
        }
        const t = ctx.createLinearGradient(C - R * 0.7, C - R * 0.7, C + R, C + R); t.addColorStop(0, "rgba(0,0,0,0)"); t.addColorStop(1, "rgba(0,0,0,.45)"); ctx.fillStyle = t; ctx.fill(p);
      });
      break;
    }
    case "rogue": {
      // no star to light it: a dark globe seen only by a thin rim of starlight and a faint aurora of its own
      const R = 56 * u, p = disc(C, C, R);
      const g = ctx.createRadialGradient(C, C, 0, C, C, R); g.addColorStop(0, rgba(mix(DK, BLACK, 0.55))); g.addColorStop(1, rgba(mix(DK, BLACK, 0.8))); ctx.fillStyle = g; ctx.fill(p);
      texture(p, C, C, R, 6, 0.25);
      withClip(p, () => {
        const a = ctx.createRadialGradient(C, C, R * 0.8, C, C, R); a.addColorStop(0, rgba(LT, 0)); a.addColorStop(1, rgba(LT, 0.6)); ctx.fillStyle = a; ctx.fill(p);
        const t = ctx.createLinearGradient(C - R, C - R, C + R * 0.6, C + R * 0.6); t.addColorStop(0, "rgba(0,0,0,0)"); t.addColorStop(0.55, "rgba(0,0,0,.6)"); t.addColorStop(1, "rgba(0,0,0,.9)"); ctx.fillStyle = t; ctx.fill(p); // only a thin crescent of starlight shows
      });
      ctx.save(); ctx.translate(C, C - R * 0.7); ctx.scale(1, 0.32); glow(0, 0, R * 0.7, mix(LT, [120, 255, 200], 0.4), 0.35); ctx.restore();
      break;
    }
    case "locked": {
      const R = 58 * u, p = sphere(C, C, R, { night: 0, atmo: 0.25, cells: 7 });
      // the terminator runs top to bottom: a hard day side, a band of twilight, a frozen night side
      withClip(p, () => { const t = ctx.createLinearGradient(C - R * 0.25, 0, C + R * 0.35, 0); t.addColorStop(0, "rgba(0,0,0,0)"); t.addColorStop(0.5, "rgba(10,6,20,.55)"); t.addColorStop(1, "rgba(4,6,14,.88)"); ctx.fillStyle = t; ctx.fill(p); glow(C - R * 0.55, C, R * 0.5, mix(LT, WHITE, 0.5), 0.3); });
      break;
    }
    case "diamond": {
      // a cut gem: a crown of facets in four shades of its colour, a bright table, an inner sparkle
      const T = [C, C - 62 * u], Lp = [C - 54 * u, C - 10 * u], Rp = [C + 54 * u, C - 10 * u], B = [C, C + 62 * u], tl = [C - 22 * u, C - 10 * u], tr = [C + 22 * u, C - 10 * u];
      glow(C, C, 120 * u, LT, 0.3);
      const face = (pts, c) => { ctx.fillStyle = rgba(c); ctx.beginPath(); ctx.moveTo(...pts[0]); for (const q of pts.slice(1)) ctx.lineTo(...q); ctx.closePath(); ctx.fill(); };
      face([T, Lp, tl], mix(LT, WHITE, 0.45)); face([T, tl, tr], mix(LT, WHITE, 0.7)); face([T, tr, Rp], mix(LT, WHITE, 0.15));
      face([Lp, tl, B], mix(LT, DK, 0.25)); face([tl, tr, B], LT); face([tr, Rp, B], mix(LT, DK, 0.6));
      glow(C - 8 * u, C - 22 * u, 22 * u, WHITE, 0.75); glow(C + 14 * u, C + 18 * u, 10 * u, WHITE, 0.5);
      break;
    }
    case "moon": {
      // the moon in front of the edge of its giant planet
      sphere(C - 54 * u, C + 46 * u, 80 * u, { light: mix(DK, LT, 0.35), dark: mix(DK, BLACK, 0.5), cells: 5, tex: 0.35, sx: 2, halo: 0.12 });
      const p = sphere(C + 30 * u, C - 30 * u, 32 * u, { cells: 8, tex: 0.55, atmo: 0.2 });
      if (fam.name === "Volcanic Moon") withClip(p, () => { for (let k = 0; k < 5; k++) glow(C + 30 * u + (r() - 0.6) * 40 * u, C - 30 * u + (r() - 0.6) * 40 * u, 5 * u, [255, 180, 70], 0.9); });
      break;
    }
    case "shower": {
      // every meteor of a shower streaks away from one radiant point, as in the real sky
      const rx = C + 34 * u, ry = C - 64 * u; glow(rx, ry, 30 * u, LT, 0.35);
      ctx.lineCap = "round";
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * 0.62 + (r() - 0.5) * 1.5, d0 = (16 + r() * 60) * u, l = (34 + r() * 60) * u, x0 = rx + Math.cos(a) * d0, y0 = ry + Math.sin(a) * d0, x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l;
        const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(LT, 0)); g.addColorStop(0.85, rgba(mix(LT, WHITE, 0.4), 0.5 + r() * 0.5)); g.addColorStop(1, rgba(WHITE, 0.95));
        ctx.strokeStyle = g; ctx.lineWidth = (1 + r() * 2) * u; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        glow(x1, y1, 4 * u, WHITE, 0.6);
      }
      break;
    }
    case "supernova": {
      // a white-hot point inside an expanding shell of glowing knots, brighter at the rim, two colours of gas
      glow(C, C, 150 * u, LT, 0.35);
      for (let i = 0; i < 70; i++) { const a = r() * TAU, d = (70 + (r() - 0.5) * 26) * u, x = C + Math.cos(a) * d, y = C + Math.sin(a) * d; glow(x, y, (8 + r() * 14) * u, i % 3 ? LT : mix(DK, LT, 0.4), 0.35 + r() * 0.3); }
      sun(C, C, 10 * u, LT, DK, 5);
      break;
    }
    case "pulsar": {
      // a tiny neutron star sweeping two soft beams from its poles; a magnetar wears loops of magnetic field
      ctx.save(); ctx.translate(C, C); ctx.rotate(-0.5);
      for (const sgn of [-1, 1]) for (const [w, a] of [[34, 0.12], [20, 0.22], [8, 0.5]]) { const g = ctx.createLinearGradient(0, 0, 0, sgn * 150 * u); g.addColorStop(0, rgba(mix(LT, WHITE, 0.4), a)); g.addColorStop(1, rgba(LT, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-3 * u, 0); ctx.lineTo(-w * u, sgn * 150 * u); ctx.lineTo(w * u, sgn * 150 * u); ctx.lineTo(3 * u, 0); ctx.fill(); }
      if (fam.name === "Magnetar") for (const k of [38, 62, 86]) { ctx.strokeStyle = rgba(LT, 0.35 - k / 400); ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.ellipse(-k * 0.5 * u, 0, k * 0.5 * u, k * 0.22 * u, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.ellipse(k * 0.5 * u, 0, k * 0.5 * u, k * 0.22 * u, 0, 0, TAU); ctx.stroke(); }
      ctx.restore();
      sun(C, C, 9 * u, LT, DK, 4);
      break;
    }
    case "blackhole": {
      // the shadow, a thin photon ring, and the accretion disk -- its far side bent up over the top by the gravity, the near side in front
      const hole = (x, y, sc) => {
        const R = 30 * u * sc, hot = mix(LT, WHITE, 0.55);
        glow(x, y, R * 4.2, LT, 0.28);
        const disk = (from, to) => { for (const [w, a, c] of [[24, 0.14, LT], [12, 0.34, LT], [5, 0.7, hot], [1.6, 0.95, WHITE]]) { ctx.strokeStyle = rgba(c, a); ctx.lineWidth = w * u * sc; ctx.beginPath(); ctx.ellipse(x, y, R * 2.9, R * 0.5, -0.12, from, to); ctx.stroke(); } };
        // the disk's far side, bent by gravity into a bright ring that wraps over and under the shadow
        for (const [w, a, c] of [[16, 0.16, LT], [7, 0.4, LT], [2.4, 0.9, hot]]) { ctx.strokeStyle = rgba(c, a); ctx.lineWidth = w * u * sc; ctx.beginPath(); ctx.ellipse(x, y, R * 1.42, R * 1.3, -0.12, 0, TAU); ctx.stroke(); }
        disk(Math.PI, TAU); // the far half of the flat disk, behind
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(WHITE, 0.8); ctx.lineWidth = 1.1 * u * sc; ctx.beginPath(); ctx.arc(x, y, R * 1.04, 0, TAU); ctx.stroke(); // photon ring
        disk(0, Math.PI); // the near half, in front of the shadow
      };
      if (fam.name.startsWith("Binary")) { hole(C - 48 * u, C - 18 * u, 0.55); hole(C + 48 * u, C + 18 * u, 0.55); } else hole(C, C, 1);
      break;
    }
    case "quasar": {
      // a blinding core in a faint host galaxy, firing two tapered jets in opposite directions
      ctx.save(); ctx.translate(C, C); ctx.rotate(-0.4); ctx.scale(1, 0.45); glow(0, 0, 110 * u, mix(DK, LT, 0.4), 0.35); ctx.restore();
      ctx.save(); ctx.translate(C, C); ctx.rotate(0.35);
      for (const sgn of [-1, 1]) for (const [w, a] of [[9, 0.18], [3.5, 0.6]]) { const g = ctx.createLinearGradient(0, 0, 0, sgn * 150 * u); g.addColorStop(0, rgba(mix(LT, WHITE, 0.5), a)); g.addColorStop(1, rgba(LT, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w * 0.3 * u, 0); ctx.lineTo(-w * u, sgn * 150 * u); ctx.lineTo(w * u, sgn * 150 * u); ctx.lineTo(w * 0.3 * u, 0); ctx.fill(); }
      ctx.restore();
      sun(C, C, 12 * u, LT, DK, 6);
      break;
    }
    case "nebula": {
      // gas in many soft knots of two colours, cut by dark dust, a few young stars glowing inside
      for (let i = 0; i < 90; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 120 * u, x = C + Math.cos(a) * d * 1.2, y = C + Math.sin(a) * d * 0.85, rad = (8 + r() * 30) * u; const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, i % 3 ? pal[0] : pal[1]); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.globalAlpha = 0.16 + r() * 0.2; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill(); }
      for (let i = 0; i < 22; i++) { const x = C + (r() - 0.5) * 220 * u, y = C + (r() - 0.5) * 160 * u, rad = (6 + r() * 18) * u; const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, "rgba(2,3,6,.85)"); g.addColorStop(1, "rgba(2,3,6,0)"); ctx.globalAlpha = 0.6; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) { const x = C + (r() - 0.5) * 160 * u, y = C + (r() - 0.5) * 120 * u; glow(x, y, 9 * u, [220, 232, 255], 0.8); ctx.fillStyle = "#F4F8FF"; ctx.beginPath(); ctx.arc(x, y, 1.8 * u, 0, TAU); ctx.fill(); }
      break;
    }
    case "star": { const big = fam.name === "Red Giant"; sun(C, C, (big ? 62 : 26) * u, LT, DK, big ? 1.9 : 3.4); break; }
  }
  // the version's finish -- soft light, never lines across the object
  if (ver === "prismatic" && ctx.createConicGradient) {
    const g = ctx.createConicGradient(0, C, C); ["#F06A5A", "#F2B45A", "#6FD9A8", "#7FA6F5", "#B48CF2", "#F06A5A"].forEach((c, i) => g.addColorStop(i / 5, c));
    ctx.strokeStyle = g; for (const [w, a] of [[16, 0.12], [8, 0.22], [2.5, 0.75]]) { ctx.lineWidth = w * u; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(C, C, 118 * u, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  if (ver === "ancient") { // aged: a sepia cast over the object and a faint golden halo
    ctx.globalCompositeOperation = bare ? "source-atop" : "color"; ctx.fillStyle = "rgba(170,120,60,.5)"; ctx.fillRect(0, 0, W, W);
    ctx.globalCompositeOperation = "destination-over"; glow(C, C, 140 * u, [233, 196, 106], 0.22); ctx.globalCompositeOperation = "source-over";
  }
  if (ver === "mythic") { // a golden aura, a soft gold ring and a few twinkles
    ctx.globalCompositeOperation = "destination-over"; glow(C, C, 150 * u, [233, 196, 106], 0.4); ctx.globalCompositeOperation = "source-over";
    for (const [w, a] of [[12, 0.15], [5, 0.3], [2, 0.85]]) { ctx.strokeStyle = rgba([233, 196, 106], a); ctx.lineWidth = w * u; ctx.beginPath(); ctx.arc(C, C, 124 * u, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { const a = r() * TAU, d = (100 + r() * 50) * u; glow(C + Math.cos(a) * d, C + Math.sin(a) * d, (3 + r() * 4) * u, [255, 244, 214], 0.9); }
  }
  ctx.restore();
}

// The member's rarest find as it hangs in their sky: the object alone, turned by `rot` degrees (a comet's tail away from the core), its
// square edges faded out so it sits in the sky rather than on a tile. Returns a canvas of `px` square.
export function skyObject(find, px, rot = 0) {
  const big = document.createElement("canvas"); big.width = big.height = px * 2;
  drawObject(big.getContext("2d"), px * 2, find, null, { bare: true });
  const cv = document.createElement("canvas"); cv.width = cv.height = px;
  const ctx = cv.getContext("2d");
  ctx.translate(px / 2, px / 2); ctx.rotate((rot * Math.PI) / 180); ctx.drawImage(big, -px / 2, -px / 2, px, px); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  const g = ctx.createRadialGradient(px / 2, px / 2, px * 0.3, px / 2, px / 2, px / 2); g.addColorStop(0, "#000"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, px, px);
  return cv;
}

// The telescope: the picture shown through ever finer pixels and fading noise, then done().
export function sharpen(cv, find, edge, done) {
  const off = document.createElement("canvas"); off.width = off.height = 320;
  drawObject(off.getContext("2d"), 320, find, edge);
  const ctx = cv.getContext("2d"), small = document.createElement("canvas"), sctx = small.getContext("2d");
  const steps = [4, 6, 9, 13, 18, 26, 38, 56, 80, 120, 180, 320];
  let i = 0;
  const tick = () => {
    const n = steps[i]; small.width = small.height = n;
    sctx.imageSmoothingEnabled = true; sctx.drawImage(off, 0, 0, n, n);
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 320, 320); ctx.drawImage(small, 0, 0, 320, 320);
    const noise = 1 - i / (steps.length - 1);
    for (let k = 0; k < 900 * noise; k++) { ctx.fillStyle = `rgba(236,231,220,${Math.random() * 0.35 * noise})`; ctx.fillRect(Math.random() * 320, Math.random() * 320, 2, 2); }
    i++;
    if (i < steps.length) setTimeout(tick, i < 6 ? 260 : 170); else done();
  };
  tick();
}


// ---- share cards (1200 x 630, the link-preview size; uploaded through /api/lab-share as /s/<id>) ----
const font = (name) => (typeof window === "undefined" ? "sans-serif" : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "sans-serif");
let badgeText = null; // this season's badge ("2026 · SURVEYOR"), set by the page before drawing a card
export const setCardBadge = (t) => { badgeText = t || null; };
let cardSkin = { sky: "deep", core: "classic" }; // the member's equipped skins, set by the page before drawing a card
export const setCardSkin = (k) => { cardSkin = { sky: "deep", core: "classic", ...(k || {}) }; };
let cardFrame = null; // "silver" | "gold": the season frame the member has earned
export const setCardFrame = (f) => { cardFrame = f || null; };

// The skins on a card are the SAME art as the page (SkyBackdrop / CoreSkin in ./skins.js), rendered to an SVG picture and drawn onto the canvas,
// so the cards always match what the member sees. Cards are always the dark sky, so the theme-aware colours get their dark values here.
const DARK_VARS = { "--sky-gold": "#E9C46A", "--sky-band": "#D9CFC0", "--sky-white": "#ECE7DC", "--sky-glow": "#CFE0FF", "--sky-blue": "#4C7DF0", "--sky-ember": "#E8643F", "--star": "#ECE7DC", "--sky-t-blue": "#CFE0FF", "--sky-t-white": "#F4F1EA", "--sky-t-gold": "#FFE3A8", "--sky-t-orange": "#FFB57A", "--sky-gal-warm": "#F2C894", "--sky-gal-cool": "#A9C4FF", "--sky-scrim": "#000" };
// Renders a whole <svg> through React (so SVG elements like linearGradient are recognised) and loads it as a picture.
function svgPicture(children, viewBox, w, h) {
  const markup = renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} viewBox={viewBox} style={DARK_VARS}>{children}</svg>);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // a card without its skin is better than no card
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}
async function drawBackdrop(ctx) {
  // the Hubble field on every card (stars in colour temperatures with spikes, distant galaxies), with the equipped sky skin over it
  const img = await svgPicture(
    <>
      <Galaxies id="cg" seed={31} n={18} span={840} />
      <StarField seed={7} n={260} span={840} />
      <SkyBackdrop skin={cardSkin.sky} />
      <Scrim id="cs0" w={840} h={440} />
    </>,
    "-420 -220 840 440", 1200, 630,
  );
  if (img) ctx.drawImage(img, 0, 0, 1200, 630);
}
// The core with its skin, centred on (cx, cy), body radius ~46 at scale 1.
async function drawCore(ctx, cx, cy, scale = 1) {
  const k = cardSkin.core, body = k === "horizon" ? "#0B0B0B" : "#ECE7DC";
  const inner = (
    <>
      <Bloom r={300} id="cb" />
      <CoreSkin skin={k} layer="back" />
      <circle r="56" fill="none" stroke="#E8643F" strokeWidth="2" />
      <circle r="46" fill={body} />
      {k !== "horizon" && (
        <>
          <StarSurface r={46} id="css" />
        </>
      )}
      <CoreSkin skin={k} layer="front" />
    </>
  );
  const size = 640 * scale, img = await svgPicture(inner, "-320 -320 640 640", size, size);
  if (img) ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

// `corners: false` leaves out the top-right badge and the bottom-right signature (the season card sets them in its own text column);
// `shadeTo` is where the left-hand darkening behind the words fades out.
async function base(ctx, eyebrow, { corners = true, shadeTo = 760 } = {}) {
  ctx.fillStyle = "#0B0B0B"; ctx.fillRect(0, 0, 1200, 630);
  await drawBackdrop(ctx);
  const shade = ctx.createLinearGradient(0, 0, shadeTo, 0); shade.addColorStop(0, "rgba(0,0,0,.62)"); shade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 1200, 630); // keeps the words readable over the nebula
  if (cardFrame) { ctx.strokeStyle = cardFrame === "gold" ? "#E9C46A" : "#C9CED6"; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 1190, 620); ctx.lineWidth = 1.5; ctx.strokeRect(20, 20, 1160, 590); }
  ctx.fillStyle = "#E8643F"; ctx.fillRect(0, 0, 1200, 6); ctx.fillRect(64, 70, 10, 10);
  ctx.fillStyle = "#A39E92"; ctx.font = `400 20px ${font("--font-mono")}`; ctx.fillText(eyebrow.toUpperCase(), 88, 81);
  if (!corners) return;
  ctx.textAlign = "right"; ctx.font = `400 18px ${font("--font-mono")}`; ctx.fillText("DYNASTY SINGULARITY · THE NIGHT SKY", 1136, 590);
  if (badgeText) {
    ctx.font = `700 18px ${font("--font-mono")}`; const w = ctx.measureText(badgeText).width + 28;
    ctx.strokeStyle = "#E9C46A"; ctx.lineWidth = 2; ctx.strokeRect(1136 - w, 58, w, 34); ctx.fillStyle = "#E9C46A"; ctx.fillText(badgeText, 1122, 81);
  }
  ctx.textAlign = "left";
}
function wrap(ctx, text, x, y, maxW, lh) { const words = text.split(" "); let line = ""; for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = t; } ctx.fillText(line, x, y); return y; }
const canvas = () => { const c = document.createElement("canvas"); c.width = 1200; c.height = 630; return c; };

export async function findCard(find, { title, compliment, have, size }) {
  const cv = canvas(), ctx = cv.getContext("2d");
  await base(ctx, `${title} discovered`);
  const off = document.createElement("canvas"); off.width = off.height = 420;
  drawObject(off.getContext("2d"), 420, find);
  ctx.save(); ctx.beginPath(); ctx.arc(900, 300, 200, 0, 7); ctx.clip(); ctx.drawImage(off, 690, 90, 420, 420); ctx.restore();
  ctx.strokeStyle = "#27251F"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(900, 300, 200, 0, 7); ctx.stroke();
  ctx.fillStyle = "#ECE7DC"; ctx.font = `800 84px ${font("--font-display")}`;
  wrap(ctx, find.name.toUpperCase(), 64, 210, 560, 84);
  ctx.fillStyle = "#E9C46A"; ctx.font = `400 28px ${font("--font-mono")}`; ctx.fillText(`1 IN ${find.oneIn.toLocaleString()} FINDS · ${find.id}`, 64, 430);
  ctx.fillStyle = "#A39E92"; ctx.font = `400 22px ${font("--font-mono")}`; ctx.fillText(`${have.toLocaleString()} of ${size.toLocaleString()} in my catalogue`, 64, 478);
  if (compliment) { ctx.fillStyle = "#E9C46A"; ctx.font = `italic 700 26px ${font("--font-body")}`; wrap(ctx, `"${compliment}."`, 64, 525, 600, 30); }
  return cv;
}
export async function receiptCard(wk) {
  const cv = canvas(), ctx = cv.getContext("2d");
  await base(ctx, `Beat the Model · week ${wk.week}`);
  ctx.fillStyle = "#ECE7DC"; ctx.font = `800 120px ${font("--font-display")}`; ctx.fillText(`${wk.right} OF ${wk.made}`, 64, 230);
  ctx.fillStyle = "#A39E92"; ctx.font = `400 24px ${font("--font-mono")}`; ctx.fillText(wk.right * 2 > wk.made ? "I BEAT THE MODEL. YOUR TURN." : "THE MODEL GOT ME THIS WEEK.", 64, 290);
  wk.pairs.forEach((p, i) => {
    const c = wk.choice[i]; if (c == null) return;
    ctx.fillStyle = "#ECE7DC"; ctx.font = `400 26px ${font("--font-mono")}`; ctx.fillText(`${p.pos} · ${c === 0 ? p.a : p.b} over ${c === 0 ? p.b : p.a}`, 64, 370 + i * 46);
  });
  return cv;
}
export async function seasonCard(state, { title, size, rarest }) {
  const cv = canvas(), ctx = cv.getContext("2d");
  await base(ctx, `My ${state.season} season sky`, { corners: false, shadeTo: 620 }); // the year and the eyebrow are one line (founder, Nov 17 2026)
  // the constellations drawn like the page: lit stars glowing, unlit ones as faint outlines
  const sky = skyFor(state.season);
  const stars = await svgPicture(
    <>
      {sky.map((c) => {
        const f = state.filled[c.id] || [];
        return (
          <g key={c.id}>
            {c.edges.map(([i, j]) => { const lit = f[i] && f[j]; return lit ? <GlowLine key={`${i}-${j}`} x1={c.pts[i][0]} y1={c.pts[i][1]} x2={c.pts[j][0]} y2={c.pts[j][1]} color={STAR[c.color]} /> : <line key={`${i}-${j}`} x1={c.pts[i][0]} y1={c.pts[i][1]} x2={c.pts[j][0]} y2={c.pts[j][1]} stroke="#ECE7DC" strokeOpacity={0.24} strokeWidth={1} strokeDasharray="2 3" />; })}
            {c.pts.map(([x, y, r], i) => (f[i] ? (
              <LitStar key={i} x={x} y={y} r={r * 1.25} color={STAR[f[i]]} />
            ) : <circle key={i} cx={x} cy={y} r={r + 0.8} fill="none" stroke="#ECE7DC" strokeOpacity=".35" strokeDasharray="2 2" />))}
          </g>
        );
      })}
    </>,
    "-300 -300 600 600", 600, 600,
  );
  // The sky has the right of the card to itself (Nov 17 2026, founder: no star hidden or crossed): every constellation point lies within
  // +-256 of the centre, so at 1:1 around (885, 315) they span x 629-1141, y 59-571 -- clear of the text column (ends at 556) and the frame.
  const SX = 885, SY = 315;
  if (stars) ctx.drawImage(stars, SX - 300, SY - 300, 600, 600);
  if (rarest) {
    // the rarest find hangs in the sky where its kind belongs (lib/skyPlacement.js), with its orbit drawn faintly when it has one
    const p = placeFind(rarest.fam, sky, { w: 600, h: 600 });
    if (p.orbit) { ctx.save(); ctx.strokeStyle = "rgba(236,231,220,.16)"; ctx.lineWidth = p.belt ? 6 : 1; ctx.setLineDash(p.belt ? [1, 5] : [3, 5]); ctx.beginPath(); ctx.arc(SX, SY, p.orbit, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    const art = p.size * 1.45, img = skyObject(rarest, Math.round(art * 2), p.rot);
    ctx.drawImage(img, SX + p.x - art / 2, SY + p.y - art / 2, art, art);
  }
  await drawCore(ctx, SX, SY, 1);

  // The text column, x 64-556: eyebrow (with the season's year), title, a hairline, the four figures, a hairline, the rarest find, the signature.
  const L = 64, R = 556, mono = font("--font-mono"), display = font("--font-display");
  const rule = (y) => { ctx.fillStyle = "rgba(236,231,220,.16)"; ctx.fillRect(L, y, R - L, 1); };
  let ts = 84; ctx.font = `800 ${ts}px ${display}`;
  while (ctx.measureText(title.toUpperCase()).width > R - L && ts > 44) { ts -= 2; ctx.font = `800 ${ts}px ${display}`; }
  ctx.fillStyle = "#ECE7DC"; ctx.fillText(title.toUpperCase(), L, 182);
  rule(212);
  const finds = Object.values(state.found).reduce((a, b) => a + b.n, 0);
  const cells = [[seasonProgress(state).points.toLocaleString(), "Season points"], [String(finds), "Finds"], [`${Object.keys(state.found).length} / ${size.toLocaleString()}`, "Catalogue"], [`${state.btm[0]}-${state.btm[1]}`, "Vs the model"]];
  cells.forEach(([v, l], i) => {
    const x = L + (i % 2) * 250, y = 292 + Math.floor(i / 2) * 104;
    ctx.fillStyle = "#ECE7DC"; ctx.font = `800 56px ${display}`; ctx.fillText(v, x, y);
    ctx.fillStyle = "#A39E92"; ctx.font = `400 15px ${mono}`; ctx.fillText(l.toUpperCase(), x, y + 28);
  });
  rule(448);
  if (rarest) {
    ctx.fillStyle = "#A39E92"; ctx.font = `400 15px ${mono}`; ctx.fillText(`RAREST FIND · 1 IN ${rarest.oneIn.toLocaleString()}`, L, 482);
    ctx.fillStyle = "#E9C46A"; ctx.font = `700 22px ${mono}`; wrap(ctx, rarest.name.toUpperCase(), L, 514, R - L, 28);
  }
  ctx.fillStyle = "#A39E92"; ctx.font = `400 14px ${mono}`; ctx.fillText("DYNASTY SINGULARITY · THE NIGHT SKY", L, 590);
  return cv;
}
export const toBlob = (cv) => new Promise((res) => cv.toBlob(res, "image/png"));
