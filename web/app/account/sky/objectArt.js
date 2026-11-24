"use client";

import { FAMILIES, COLOURS } from "@/lib/nightSky";

// The Night Sky's object pictures, REBUILT Nov 22 2026 (founder: "i dont like the blurry look it makes it seem amateurish"). The old
// renderer painted every body with soft radial gradients, a tiny noise grid blown up (blobs), and wide glows around everything. Now:
// - solid bodies (asteroids, worlds, moons, comet nuclei) are rendered PER PIXEL: a sharp multi-octave 3D noise terrain plus real craters
//   (bowl + raised rim) as a height field, lit by one sun from the upper left (Lambert, a crisp terminator, a little specular on ice and
//   metal), with an anti-aliased one-pixel edge -- no halo around anything that doesn't shine itself;
// - things that DO shine (stars, cores, jets) get a tight bloom, not a haze, and a granulated per-pixel surface;
// - gas (nebulae, supernova shells, comas) is domain-warped noise with filaments, so it has structure at every scale;
// - tails, jets, meteors, rings are many fine lines, not feathered cones.
// The random stream (`r`) and the noise seed depend only on the find, so a find always looks the same.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
const grey = (c) => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return [l, l, l]; };
const desat = (c, k) => mix(c, grey(c), k);
const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// ---- value noise (3D, hashed lattice, quintic fade) ----
function makeNoise(seed) {
  const hash = (x, y, z) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const n3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
      l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
  };
  const fbm = (x, y, z, oct = 5) => { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * n3(x * f + i * 17.3, y * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; };
  // ridged: thin bright creases (cracks, filaments, mountain ridges)
  const ridged = (x, y, z, oct = 4) => { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(2 * n3(x * f + i * 31.7, y * f, z * f) - 1); s += a * v * v; n += a; a *= 0.5; f *= 2.1; } return s / n; };
  return { n3, fbm, ridged };
}

// ---- a lit body, per pixel ----
// surface(p, n) -> { h, c: [0..255 rgb], e?: emitted rgb, s?: specular 0..1 } at the unit-sphere point p (rotated for texture) and the view
// normal n. shape(theta) -> radius multiplier (irregular rocks). L = light direction (toward the light). Draws onto ctx with crisp edges.
function body(ctx, { cx, cy, R, surface, shape = null, bump = 1, L = norm3(-0.62, -0.55, 0.56), ambient = 0.025, atmo = null, spin = [0.6, 0.35], wrap = 0.03 }) {
  let maxM = 1;
  if (shape) for (let k = 0; k < 64; k++) maxM = Math.max(maxM, shape((k / 64) * TAU));
  const ext = R * maxM + 2, x0 = Math.floor(cx - ext), y0 = Math.floor(cy - ext), w = Math.ceil(2 * ext) + 2;
  const N = w * w, H = new Float32Array(N), A = new Float32Array(N), NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);
  const CR = new Float32Array(N), CG = new Float32Array(N), CB = new Float32Array(N), ER = new Float32Array(N), EG = new Float32Array(N), EB = new Float32Array(N), SP = new Float32Array(N);
  const [ya, pa] = spin, cy1 = Math.cos(ya), sy1 = Math.sin(ya), cp = Math.cos(pa), sp = Math.sin(pa);
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const dx = x0 + i + 0.5 - cx, dy = y0 + j + 0.5 - cy, m = shape ? shape(Math.atan2(dy, dx)) : 1, Rm = R * m, d = Math.hypot(dx, dy) / Rm;
    const cov = clamp((1 - d) * Rm + 0.5);
    if (cov <= 0) continue;
    const k = j * w + i, nx = Math.min(d, 0.999) * (dx / (Math.hypot(dx, dy) || 1)), ny = Math.min(d, 0.999) * (dy / (Math.hypot(dx, dy) || 1)), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    // rotate the point for the texture so features aren't centred on the view
    const x1 = nx * cy1 + nz * sy1, z1 = -nx * sy1 + nz * cy1, y2 = ny * cp - z1 * sp, z2 = ny * sp + z1 * cp;
    const s = surface([x1, y2, z2], [nx, ny, nz]);
    A[k] = cov; H[k] = s.h || 0; NX[k] = nx; NY[k] = ny; NZ[k] = nz;
    CR[k] = s.c[0]; CG[k] = s.c[1]; CB[k] = s.c[2]; SP[k] = s.s || 0;
    if (s.e) { ER[k] = s.e[0]; EG[k] = s.e[1]; EB[k] = s.e[2]; }
  }
  const cv = document.createElement("canvas"); cv.width = cv.height = w;
  const c2 = cv.getContext("2d"), img = c2.createImageData(w, w), D = img.data;
  const V = [0, 0, 1];
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i; if (A[k] <= 0) continue;
    const hl = i > 0 && A[k - 1] > 0 ? H[k - 1] : H[k], hr = i < w - 1 && A[k + 1] > 0 ? H[k + 1] : H[k];
    const hu = j > 0 && A[k - w] > 0 ? H[k - w] : H[k], hd = j < w - 1 && A[k + w] > 0 ? H[k + w] : H[k];
    const gx = (hr - hl) * 0.5 * R * bump, gy = (hd - hu) * 0.5 * R * bump;
    const n = norm3(NX[k] - gx * NZ[k], NY[k] - gy * NZ[k], NZ[k]);
    const nl = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
    const lam = clamp((nl + wrap) / (1 + wrap));
    // the big shape's own shadow (so bumps on the night side stay dark)
    const big = clamp(((NX[k] * L[0] + NY[k] * L[1] + NZ[k] * L[2]) + 0.12) / 0.24);
    const lit = lam * big, sh = ambient + (1 - ambient) * lit;
    let r = CR[k] * sh, g = CG[k] * sh, b = CB[k] * sh;
    if (SP[k]) { const hv = norm3(L[0] + V[0], L[1] + V[1], L[2] + V[2]), sp2 = Math.pow(clamp(n[0] * hv[0] + n[1] * hv[1] + n[2] * hv[2]), 40) * SP[k] * big * 255; r += sp2; g += sp2; b += sp2; }
    if (atmo) { const rim = Math.pow(1 - NZ[k], 3) * clamp((NX[k] * L[0] + NY[k] * L[1] + NZ[k] * L[2]) * 0.9 + 0.35) * atmo.k; r += atmo.c[0] * rim; g += atmo.c[1] * rim; b += atmo.c[2] * rim; }
    r += ER[k]; g += EG[k]; b += EB[k];
    const o = k * 4; D[o] = clamp(r, 0, 255); D[o + 1] = clamp(g, 0, 255); D[o + 2] = clamp(b, 0, 255); D[o + 3] = Math.round(A[k] * 255);
  }
  c2.putImageData(img, 0, 0);
  ctx.drawImage(cv, x0, y0);
}

// a whole-canvas per-pixel layer (gas): fn(x, y) -> [r, g, b, a(0..1)] composited with `op`
function field(ctx, W, fn, op = "lighter", step = 1) {
  const w = Math.ceil(W / step), cv = document.createElement("canvas"); cv.width = cv.height = w;
  const c2 = cv.getContext("2d"), img = c2.createImageData(w, w), D = img.data;
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const v = fn((i + 0.5) * step, (j + 0.5) * step); if (!v) continue;
    const o = (j * w + i) * 4; D[o] = clamp(v[0], 0, 255); D[o + 1] = clamp(v[1], 0, 255); D[o + 2] = clamp(v[2], 0, 255); D[o + 3] = clamp(v[3]) * 255;
  }
  c2.putImageData(img, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = op; ctx.imageSmoothingQuality = "high"; ctx.drawImage(cv, 0, 0, W, W); ctx.restore();
}

export function drawObject(ctx, W, find, edge, { bare = false } = {}) {
  const fam = FAMILIES[find.fam], pal = COLOURS.find((c) => c.id === find.colour).c, ver = find.version;
  let s = 11 + find.fam * 97; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const NZ = makeNoise(7 + find.fam * 131 + COLOURS.findIndex((c) => c.id === find.colour) * 17);
  const { fbm, ridged, n3 } = NZ;
  ctx.save();
  const C = W / 2, u = W / 320;
  const LT = hex(pal[0]), DK = hex(pal[1]);
  // a tight bloom for things that shine; nothing else gets one
  const bloom = (x, y, rad, c, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, rgba(c, a)); g.addColorStop(0.18, rgba(c, a * 0.35)); g.addColorStop(0.5, rgba(c, a * 0.08)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill(); };
  const twinkle = (x, y, len, c, a) => { // a sharp four-point glint (stars, gems), drawn with thin lines
    ctx.save(); ctx.lineCap = "round";
    for (const [dx, dy, k] of [[1, 0, 1], [0, 1, 1], [0.7, 0.7, 0.45], [0.7, -0.7, 0.45]]) { const g = ctx.createLinearGradient(x - dx * len * k, y - dy * len * k, x + dx * len * k, y + dy * len * k); g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.5, rgba(c, a)); g.addColorStop(1, rgba(c, 0)); ctx.strokeStyle = g; ctx.lineWidth = Math.max(0.8, 1.1 * u); ctx.beginPath(); ctx.moveTo(x - dx * len * k, y - dy * len * k); ctx.lineTo(x + dx * len * k, y + dy * len * k); ctx.stroke(); }
    ctx.fillStyle = rgba(WHITE, a); ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, 1.3 * u), 0, TAU); ctx.fill(); ctx.restore();
  };

  // ---- the field: near-black with a faint deep-blue cast, crisp point stars (a few with a small glint), two small distant galaxies ----
  ctx.fillStyle = "#020306"; ctx.fillRect(0, 0, W, W);
  { const g = ctx.createRadialGradient(C, C, 0, C, C, W * 0.75); g.addColorStop(0, "rgba(18,24,46,.6)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); }
  const TEMP = [[207, 224, 255], [244, 241, 234], [244, 241, 234], [255, 227, 168], [255, 196, 150]];
  for (let k = 0; k < 2; k++) { const x = r() * W, y = r() * W, sz = (5 + r() * 5) * u, t = r() < 0.6 ? [242, 200, 148] : [169, 196, 255]; ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 3); ctx.scale(1, 0.3 + r() * 0.3); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, sz); g.addColorStop(0, rgba(t, 0.75)); g.addColorStop(0.3, rgba(t, 0.3)); g.addColorStop(1, rgba(t, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, sz, 0, TAU); ctx.fill(); ctx.restore(); }
  const nStars = Math.round(W * 0.5);
  for (let i = 0; i < nStars; i++) {
    const m = Math.pow(r(), 4), x = r() * W, y = r() * W, t = TEMP[Math.floor(r() * TEMP.length)];
    if (m > 0.8) twinkle(x, y, (3 + m * 5) * u, t, 0.45 + m * 0.35);
    else { ctx.fillStyle = rgba(t, 0.3 + m * 1.2); const z = Math.max(0.6, (0.45 + m * 1.6) * u); ctx.fillRect(x - z / 2, y - z / 2, z, z); }
  }
  if (bare) ctx.clearRect(0, 0, W, W); // the field above still ran, so the object's own details come out the same as in its thumbnail
  if (edge) { const g = ctx.createRadialGradient(W - 8 * u, 24 * u, 2, W - 8 * u, 24 * u, 90 * u); g.addColorStop(0, "rgba(233,196,106,.9)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); }

  // ---- surfaces ----
  const craters = (n, min = 0.1, max = 0.32) => Array.from({ length: n }, () => {
    const z = 0.15 + r() * 0.85, a = r() * TAU, q = Math.sqrt(1 - z * z);
    return { c: [Math.cos(a) * q, Math.sin(a) * q, z], rad: min + r() * (max - min), depth: 0.35 + r() * 0.3 };
  });
  const craterH = (p, list) => {
    let h = 0;
    for (const k of list) {
      const t = Math.acos(clamp(p[0] * k.c[0] + p[1] * k.c[1] + p[2] * k.c[2], -1, 1)) / k.rad;
      if (t < 1) h -= k.depth * (1 - t * t) * 0.55; // the bowl
      if (t < 1.6) h += k.depth * 0.22 * Math.exp(-(((t - 1) / 0.14) ** 2)); // the raised rim
    }
    return h;
  };
  // shape of an irregular rock: a few low harmonics, an elongation
  const rockShape = (k = 0) => {
    const ph = [r() * TAU, r() * TAU, r() * TAU, r() * TAU], el = 0.1 + r() * 0.12, tilt = r() * TAU;
    return (t) => 1 + el * Math.cos(2 * (t - tilt)) + 0.07 * Math.sin(3 * t + ph[0] + k) + 0.045 * Math.sin(5 * t + ph[1]) + 0.022 * Math.sin(8 * t + ph[2]) + 0.01 * Math.sin(13 * t + ph[3]);
  };
  // asteroid colouring by kind: metal, stone, carbon, ice; the find's colour tints it without turning it neon
  const rockLook = (name) => {
    if (name.includes("Iron")) return { lt: mix(desat(LT, 0.55), [200, 200, 205], 0.3), dk: desat(DK, 0.6), spec: 0.55, sat: 0.55 };
    if (name.includes("Carbon")) return { lt: mix(desat(LT, 0.5), [60, 58, 55], 0.55), dk: mix(DK, BLACK, 0.55), spec: 0.05 };
    if (name.includes("Kuiper") || name === "Centaur") return { lt: mix(desat(LT, 0.35), [235, 232, 226], 0.25), dk: desat(DK, 0.4), spec: 0.25 };
    return { lt: desat(LT, 0.45), dk: desat(DK, 0.5), spec: 0.1 };
  };
  const rock = (x, y, R, k = 0, look = rockLook(fam.name)) => {
    const cr = craters(5 + Math.floor(r() * 4)), sh = rockShape(k), f0 = r() * 10;
    body(ctx, {
      cx: x, cy: y, R, shape: sh, bump: 1, spin: [r() * 3, r() * 2],
      surface: (p) => {
        const big = fbm(p[0] * 1.5 + f0, p[1] * 1.5, p[2] * 1.5, 3), fine = fbm(p[0] * 7 + f0, p[1] * 7, p[2] * 7, 4), grit = n3(p[0] * 40, p[1] * 40, p[2] * 40);
        const h = (big - 0.5) * 0.55 + (fine - 0.5) * 0.16 + (grit - 0.5) * 0.025 + craterH(p, cr);
        const t = clamp(0.5 + (fine - 0.5) * 0.9 + (big - 0.5) * 0.5);
        return { h, c: mix(look.dk, look.lt, t), s: look.spec };
      },
    });
  };
  // planets and worlds: (p) -> colour per kind
  const world = (x, y, R, kind, opts = {}) => {
    const f0 = r() * 10, cr = kind === "icy" || kind === "rocky" ? craters(7, 0.06, 0.2) : [];
    const surfaces = {
      icy: (p) => { const v = fbm(p[0] * 3 + f0, p[1] * 3, p[2] * 3, 5), cracks = ridged(p[0] * 5, p[1] * 5, p[2] * 5, 3);
        return { h: (v - 0.5) * 0.25 + craterH(p, cr) * 0.6 - cracks * 0.04, c: mix(mix(desat(LT, 0.3), WHITE, 0.45), desat(DK, 0.3), clamp((1 - v) * 0.5 + cracks * 0.6 - 0.2)), s: 0.45 }; },
      rocky: (p) => { const v = fbm(p[0] * 2.5 + f0, p[1] * 2.5, p[2] * 2.5, 5);
        return { h: (v - 0.5) * 0.5 + craterH(p, cr), c: mix(desat(DK, 0.35), desat(LT, 0.3), clamp(v * 1.3 - 0.15)), s: 0.08 }; },
      gas: (p) => { const lat = p[1] + (fbm(p[0] * 2 + f0, p[1] * 6, p[2] * 2, 4) - 0.5) * 0.18, b = 0.5 + 0.5 * Math.sin(lat * 14 + Math.sin(lat * 5) * 2);
        return { h: 0, c: mix(mix(LT, WHITE, 0.15), mix(LT, DK, 0.35), b * 0.55 + (fbm(p[0] * 8, p[1] * 20, p[2] * 8, 3) - 0.5) * 0.3) }; },
      banded: (p) => { const warp = (fbm(p[0] * 3 + f0, p[1] * 3, p[2] * 3, 4) - 0.5) * 0.35, lat = p[1] + warp * 0.35, b = Math.sin(lat * 19) * 0.5 + 0.5, b2 = Math.sin(lat * 47 + warp * 6) * 0.5 + 0.5;
        const spot = Math.exp(-(((p[0] - 0.35) / 0.18) ** 2 + ((p[1] - 0.32) / 0.09) ** 2)) * (p[2] > 0 ? 1 : 0);
        return { h: 0, c: mix(mix(mix(LT, WHITE, 0.3), mix(LT, DK, 0.55), b * 0.75 + b2 * 0.2), mix(DK, [120, 40, 20], 0.3), spot * 0.8) }; },
      ocean: (p) => { const land = fbm(p[0] * 2 + f0, p[1] * 2, p[2] * 2, 5), cloud = fbm(p[0] * 3.5 + 40, p[1] * 5, p[2] * 3.5, 5), isLand = land > 0.56;
        let c = isLand ? mix([88, 104, 70], desat(LT, 0.5), clamp((land - 0.56) * 5)) : mix(mix(DK, [10, 30, 70], 0.4), mix(LT, [40, 90, 160], 0.4), clamp(land * 1.3 - 0.2));
        const cl = clamp((cloud - 0.52) * 4); c = mix(c, [240, 242, 245], cl * 0.9);
        return { h: isLand ? (land - 0.56) * 0.6 : 0, c, s: isLand || cl > 0.3 ? 0.05 : 0.6 }; },
      desert: (p) => { const v = fbm(p[0] * 2.5 + f0, p[1] * 2.5, p[2] * 2.5, 5), dunes = ridged(p[0] * 9, p[1] * 3, p[2] * 9, 3);
        return { h: (v - 0.5) * 0.35 + dunes * 0.05, c: mix(mix(desat(DK, 0.2), [120, 70, 40], 0.25), mix(desat(LT, 0.2), [230, 190, 140], 0.3), clamp(v * 1.4 - 0.2 + dunes * 0.2)), s: 0.02 }; },
      lava: (p) => { const crack = ridged(p[0] * 3.2 + f0, p[1] * 3.2, p[2] * 3.2, 4), v = fbm(p[0] * 5, p[1] * 5, p[2] * 5, 4), hot = clamp((crack - 0.62) / 0.2);
        const e = hot > 0 ? mix(mix(LT, [255, 120, 30], 0.4), [255, 240, 190], hot * hot) .map((x) => x * hot) : null;
        return { h: (v - 0.5) * 0.4 - hot * 0.08, c: mix([22, 16, 14], mix(DK, BLACK, 0.5), v), e, s: 0.1 }; },
    };
    body(ctx, { cx: x, cy: y, R, surface: surfaces[kind], bump: kind === "gas" || kind === "banded" ? 0 : 0.9, spin: [r() * 3, (r() - 0.5) * 0.4], ...opts });
  };
  // a star or anything that shines itself: granulated, limb-darkened, white-hot in the middle, a tight bloom
  const sun = (x, y, R, cells = 14, bloomK = 2.6) => {
    bloom(x, y, R * bloomK * 1.6, LT, 0.5); bloom(x, y, R * 1.6, mix(LT, WHITE, 0.6), 0.6);
    body(ctx, { cx: x, cy: y, R, bump: 0, ambient: 1, spin: [0.4, 0.2], surface: (p, n) => {
      const mu = n[2], g = 1 - Math.pow(ridged(p[0] * cells, p[1] * cells, p[2] * cells, 2), 3), limb = 0.45 + 0.55 * Math.pow(mu, 0.55);
      return { h: 0, c: [0, 0, 0], e: mix(mix(LT, DK, 0.3), mix(LT, WHITE, 0.85), Math.pow(mu, 0.7)).map((v) => v * limb * (0.82 + 0.28 * g)) };
    } });
  };
  // a comet: a small dark nucleus, a coma with structure, a dust tail of fine curved striations and a straight, cooler ion tail
  const comet = (hx, hy, len, sc = 1) => {
    const d = [-Math.SQRT1_2, Math.SQRT1_2], q = [Math.SQRT1_2, Math.SQRT1_2], Lp = len * u * sc, ion = mix([170, 205, 255], LT, 0.25), dust = mix(LT, [250, 238, 214], 0.35);
    ctx.save(); ctx.lineCap = "round"; ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 80; i++) { // dust tail: striations fanning out and curving slightly
      const off = (r() - 0.5) * 2, spread = off * 30 * u * sc, curl = (8 + r() * 10) * u * sc, l = Lp * (0.55 + r() * 0.45);
      const ex = hx + d[0] * l + q[0] * (spread + curl), ey = hy + d[1] * l + q[1] * (spread + curl);
      const mx = hx + d[0] * l * 0.5 + q[0] * (spread * 0.35 + curl * 0.2), my = hy + d[1] * l * 0.5 + q[1] * (spread * 0.35 + curl * 0.2);
      const g = ctx.createLinearGradient(hx, hy, ex, ey); const a = (0.2 + r() * 0.3) * (1 - Math.abs(off) * 0.55);
      g.addColorStop(0, rgba(dust, a)); g.addColorStop(0.4, rgba(dust, a * 0.6)); g.addColorStop(1, rgba(dust, 0));
      ctx.strokeStyle = g; ctx.lineWidth = (0.8 + r() * 2) * u * sc; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    }
    for (let i = 0; i < 20; i++) { // ion tail: near-straight thin rays
      const off = (r() - 0.5) * 9 * u * sc, l = Lp * (0.8 + r() * 0.4), ex = hx + d[0] * l - q[0] * (6 * u * sc - off), ey = hy + d[1] * l - q[1] * (6 * u * sc - off);
      const g = ctx.createLinearGradient(hx, hy, ex, ey), a = 0.28 + r() * 0.3; g.addColorStop(0, rgba(ion, a)); g.addColorStop(1, rgba(ion, 0));
      ctx.strokeStyle = g; ctx.lineWidth = (0.5 + r() * 0.9) * u * sc; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.restore();
    bloom(hx, hy, 42 * u * sc, dust, 0.6); bloom(hx, hy, 14 * u * sc, WHITE, 0.9);
    rock(hx, hy, 4 * u * sc, 3, { lt: [200, 196, 188], dk: [40, 38, 36], spec: 0 });
  };

  switch (fam.shape) {
    case "rock":
      if (fam.name === "Centaur") { // half comet: a thin coma and fine jets of gas venting from the lit side, no tail
        bloom(C, C, 100 * u, mix(LT, WHITE, 0.3), 0.18);
        ctx.save(); ctx.lineCap = "round"; ctx.globalCompositeOperation = "lighter";
        for (const a0 of [-2.3, -1.25, -0.55]) for (let i = 0; i < 9; i++) { const a = a0 + (r() - 0.5) * 0.18, x0 = C + Math.cos(a) * 40 * u, y0 = C + Math.sin(a) * 36 * u, l = (40 + r() * 45) * u, x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l, g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(mix(LT, WHITE, 0.6), 0.3)); g.addColorStop(1, rgba(LT, 0)); ctx.strokeStyle = g; ctx.lineWidth = (0.6 + r()) * u; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
        ctx.restore();
      }
      rock(C, C, (fam.name === "Moonlet" ? 38 : fam.name.includes("Kuiper") ? 68 : 60) * u); break;
    case "rubble": for (let i = 0; i < 9; i++) rock(C + Math.cos(i * 0.9) * 36 * u, C + Math.sin(i * 1.7) * 28 * u, (10 + r() * 12) * u, i); break;
    case "twin": rock(C - 30 * u, C - 8 * u, 44 * u, 1); rock(C + 34 * u, C + 12 * u, 37 * u, 2); break;
    case "dust": { // a lit cloud of fine grains: a filamentary haze and crisp particles
      field(ctx, W, (x, y) => { const dx = (x - C) / (130 * u), dy = (y - C) / (55 * u), fall = Math.exp(-(dx * dx + dy * dy) * 1.4); if (fall < 0.02) return null; const v = fbm(x / (40 * u), y / (40 * u), 3, 5), f = ridged(x / (60 * u), y / (60 * u), 7, 3); const a = fall * clamp(v * 1.3 - 0.35) * (0.4 + f * 0.8); return [...mix(LT, WHITE, 0.2), a * 0.95]; }, "lighter");
      for (let i = 0; i < 650; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 95 * u, x = C + Math.cos(a) * d * 1.4, y = C + Math.sin(a) * d * 0.55, k = Math.pow(r(), 2); ctx.fillStyle = rgba(mix(LT, WHITE, k * 0.6), 0.35 + k * 0.6); const z = Math.max(0.6, (0.5 + k * 1.4) * u); ctx.fillRect(x - z / 2, y - z / 2, z, z); }
      break;
    }
    case "comet": {
      const n = fam.name;
      if (n === "Sungrazer") { sun(C + 118 * u, C - 118 * u, 26 * u, 10, 2.4); comet(C + 50 * u, C - 50 * u, 235, 1.15); }
      else if (n === "Interstellar Comet") { // a long cigar-shaped body passing through, barely any coma
        bloom(C, C, 40 * u, LT, 0.22);
        body(ctx, { cx: C, cy: C, R: 34 * u, shape: (t) => { const a = t + 0.85; return 1 / Math.sqrt(Math.cos(a) ** 2 + (Math.sin(a) / 0.3) ** 2) * 1.25; }, bump: 0.25, spin: [0.3, 0.2],
          surface: (p) => { const v = fbm(p[0] * 6, p[1] * 6, p[2] * 6, 4); return { h: (v - 0.5) * 0.3, c: mix([70, 50, 40], mix(desat(LT, 0.4), [200, 150, 110], 0.4), v), s: 0.05 }; } });
      } else if (n === "Main-Belt Comet") { // an asteroid trailing one thin, straight line of dust
        ctx.save(); ctx.lineCap = "round"; ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 10; i++) { const off = (r() - 0.5) * 7 * u, x0 = C + 26 * u + off * Math.SQRT1_2, y0 = C - 26 * u + off * Math.SQRT1_2, l = (120 + r() * 50) * u, x1 = x0 - l * Math.SQRT1_2, y1 = y0 + l * Math.SQRT1_2, g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(mix(LT, WHITE, 0.4), 0.3)); g.addColorStop(1, rgba(LT, 0)); ctx.strokeStyle = g; ctx.lineWidth = (0.5 + r()) * u; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
        ctx.restore();
        rock(C + 26 * u, C - 26 * u, 28 * u);
      } else if (n === "Fragmenting Comet") { // pieces strung along its orbit, each with its own small tail, in a spray of grains
        for (let i = 0; i < 90; i++) { const t = r(), x = C + 60 * u - t * 150 * u + (r() - 0.5) * 16 * u, y = C - 60 * u + t * 150 * u + (r() - 0.5) * 16 * u; ctx.fillStyle = rgba(mix(LT, WHITE, 0.4), 0.2 + r() * 0.5); const z = Math.max(0.6, (0.5 + r()) * u); ctx.fillRect(x, y, z, z); }
        [[60, 0.75], [22, 0.5], [-8, 0.42], [-34, 0.32], [-56, 0.24]].forEach(([k, sc]) => comet(C + k * u, C - k * u + (k < 0 ? 6 : 0) * u, 90, sc));
      } else comet(C + 34 * u, C - 34 * u, 180, 1.05); // long-period: the classic
      break;
    }
    case "dwarf": world(C, C, 46 * u, fam.name === "Plutoid" ? "rocky" : "icy"); if (fam.name.includes("Moon")) world(C + 74 * u, C - 44 * u, 13 * u, "rocky"); break;
    case "planet": {
      const kind = fam.name === "Ocean World" || fam.name === "Super-Earth" ? "ocean" : fam.name === "Desert World" ? "desert" : "gas";
      world(C, C, 62 * u, kind, { atmo: { c: mix(LT, [150, 190, 255], 0.5), k: kind === "desert" ? 0.35 : 0.9 } });
      break;
    }
    case "banded": world(C, C, 64 * u, "banded", { atmo: { c: mix(LT, WHITE, 0.4), k: 0.5 } }); break;
    case "ringed": {
      const ring = (from, to) => { // many fine ringlets with a gap, crisp
        ctx.save(); for (let k = 0; k < 34; k++) { const rx = (80 + k * 1.35) * u; if (k >= 14 && k <= 16) continue; const b = 0.25 + 0.6 * n3(k * 0.7, 3, 1); ctx.strokeStyle = rgba(mix(desat(LT, 0.4), [236, 226, 206], 0.5), b * (k < 6 ? 0.45 : 0.75)); ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.ellipse(C, C, rx, rx * 0.26, -0.35, from, to); ctx.stroke(); } ctx.restore();
      };
      ring(Math.PI, TAU);
      world(C, C, 54 * u, "gas", { atmo: { c: mix(LT, WHITE, 0.4), k: 0.4 } });
      ctx.save(); ctx.beginPath(); ctx.arc(C, C, 54 * u, 0, TAU); ctx.clip(); ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(C + 7 * u, C + 13 * u, 82 * u, 5 * u, -0.35, 0, TAU); ctx.fill(); ctx.restore(); // the rings' shadow
      ring(0, Math.PI);
      break;
    }
    case "lava": world(C, C, 60 * u, "lava", { ambient: 0.06 }); break;
    case "rogue": { // no star: a dark globe seen only by a thin crescent of distant light and its own faint aurora
      const R = 58 * u, aur = mix(LT, [140, 255, 210], 0.55);
      world(C, C, R, "rocky", { L: norm3(0.9, -0.3, -0.32), ambient: 0.004, atmo: { c: aur, k: 0.6 } });
      // a faint aurora: a curtain of fine vertical rays hugging the upper limb, inside the disc
      field(ctx, W, (x, y) => { const dx = x - C, dy = y - C, d = Math.hypot(dx, dy); if (d > R || dy > -R * 0.2) return null; const band = Math.exp(-((((R - d) - 6 * u) / (5 * u)) ** 2)); if (band < 0.03) return null; const rays = ridged(x / (2.2 * u), 0.3, y / (40 * u), 2); return [...aur, band * (0.25 + rays * 0.6)]; }, "lighter");
      break;
    }
    case "locked": world(C, C, 60 * u, "desert", { L: norm3(-1, -0.04, 0.02), wrap: 0.02, atmo: { c: mix(LT, WHITE, 0.4), k: 0.4 } }); break;
    case "diamond": {
      // a cut gem: crisp facets in shades of its colour, thin bright edges, sharp glints
      const T = [C, C - 64 * u], Lp = [C - 56 * u, C - 12 * u], Rp = [C + 56 * u, C - 12 * u], B = [C, C + 64 * u], tl = [C - 24 * u, C - 12 * u], tr = [C + 24 * u, C - 12 * u], ml = [C - 28 * u, C - 40 * u], mr = [C + 28 * u, C - 40 * u];
      bloom(C, C, 110 * u, LT, 0.18);
      const face = (pts, c) => { const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]); g.addColorStop(0, rgba(mix(c, WHITE, 0.15))); g.addColorStop(1, rgba(mix(c, BLACK, 0.12))); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(...pts[0]); for (const q of pts.slice(1)) ctx.lineTo(...q); ctx.closePath(); ctx.fill(); };
      face([ml, Lp, tl], mix(LT, WHITE, 0.4)); face([ml, tl, T], mix(LT, WHITE, 0.62)); face([T, tl, tr], mix(LT, WHITE, 0.8)); face([T, tr, mr], mix(LT, WHITE, 0.3)); face([mr, tr, Rp], mix(LT, WHITE, 0.1));
      face([Lp, tl, B], mix(LT, DK, 0.2)); face([tl, [C, C - 12 * u], B], mix(LT, WHITE, 0.05)); face([[C, C - 12 * u], tr, B], mix(LT, DK, 0.35)); face([tr, Rp, B], mix(LT, DK, 0.65));
      ctx.save(); ctx.strokeStyle = rgba(mix(LT, WHITE, 0.75), 0.75); ctx.lineWidth = Math.max(0.7, 0.9 * u); ctx.lineJoin = "round";
      for (const seg of [[T, ml, Lp, B, Rp, mr, T], [Lp, Rp], [tl, B], [tr, B], [T, tl], [T, tr], [ml, tl], [mr, tr]]) { ctx.beginPath(); ctx.moveTo(...seg[0]); for (const q of seg.slice(1)) ctx.lineTo(...q); ctx.stroke(); }
      ctx.restore();
      twinkle(C - 12 * u, C - 30 * u, 26 * u, WHITE, 0.95); twinkle(C + 30 * u, C + 8 * u, 12 * u, WHITE, 0.7);
      break;
    }
    case "moon": { // the moon in front of the edge of its banded giant
      world(C - 60 * u, C + 56 * u, 96 * u, "banded", { atmo: { c: mix(LT, WHITE, 0.3), k: 0.4 } });
      if (fam.name === "Volcanic Moon") {
        const f0 = r() * 10, vents = craters(6, 0.05, 0.11);
        body(ctx, { cx: C + 34 * u, cy: C - 34 * u, R: 30 * u, bump: 0.7, spin: [r() * 3, 0.2], surface: (p) => {
          const v = fbm(p[0] * 3 + f0, p[1] * 3, p[2] * 3, 5), h = craterH(p, vents);
          const vent = clamp(-h * 3), base = mix([210, 190, 80], mix(LT, [230, 140, 60], 0.4), v);
          return { h: (v - 0.5) * 0.3 + h * 0.4, c: mix(base, [40, 22, 12], vent * 0.8), e: vent > 0.6 ? [255 * (vent - 0.6), 120 * (vent - 0.6), 20 * (vent - 0.6)] : null };
        } });
      } else world(C + 34 * u, C - 34 * u, 30 * u, "icy", { atmo: { c: [200, 225, 255], k: 0.3 } });
      break;
    }
    case "shower": { // every meteor streaks away from one radiant point: fine, sharp trails with a hot head
      // the streaks are worked out first, then the whole shower (radiant to the farthest head) is moved so its box is centred in the
      // picture -- the version rings (Old light, Mythic) are drawn round the centre, and the shower used to sit up and to one side of
      // them (founder, Nov 23 2026)
      const streaks = Array.from({ length: 16 }, () => {
        const a = Math.PI * 0.62 + (r() - 0.5) * 1.5, d0 = (16 + r() * 60) * u, l = (34 + r() * 66) * u, w = (0.8 + r() * 1.6) * u;
        const x0 = Math.cos(a) * d0, y0 = Math.sin(a) * d0;
        return { x0, y0, x1: x0 + Math.cos(a) * l, y1: y0 + Math.sin(a) * l, w };
      });
      const xs = [0, ...streaks.map((m) => m.x1)], ys = [0, ...streaks.map((m) => m.y1)];
      const rx = C - (Math.min(...xs) + Math.max(...xs)) / 2, ry = C - (Math.min(...ys) + Math.max(...ys)) / 2;
      bloom(rx, ry, 18 * u, LT, 0.25);
      ctx.save(); ctx.lineCap = "round";
      for (const m of streaks) {
        const x0 = rx + m.x0, y0 = ry + m.y0, x1 = rx + m.x1, y1 = ry + m.y1, w = m.w;
        const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(LT, 0)); g.addColorStop(0.75, rgba(mix(LT, WHITE, 0.35), 0.55)); g.addColorStop(1, rgba(WHITE, 1));
        ctx.strokeStyle = g; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(x1, y1, w * 0.8, 0, TAU); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case "supernova": { // an expanding shell of filaments in two colours of gas, brighter at the rim, a white-hot point inside
      const R0 = 78 * u, kilo = fam.name === "Kilonova";
      field(ctx, W, (x, y) => {
        const dx = x - C, dy = y - C, rr = Math.hypot(dx, dy) / R0; if (rr > 1.6) return null;
        const a = Math.atan2(dy, dx), px = Math.cos(a) * 2, py = Math.sin(a) * 2;
        const warp = fbm(px * 2.5, py * 2.5, rr * 3, 4), fil = ridged(px * 4 + warp * 2, py * 4 + warp * 2, rr * 6, 5), fine = ridged(px * 11, py * 11, rr * 14, 3);
        const shell = Math.exp(-(((rr - 1 - (warp - 0.5) * 0.3) / (kilo ? 0.2 : 0.11)) ** 2)), inner = clamp(1 - rr) * 0.12 * warp;
        const dens = shell * (0.08 + 1.6 * Math.pow(fil, 3) + 0.5 * Math.pow(fine, 4)) + inner; if (dens < 0.01) return null;
        const col = mix(mix(LT, WHITE, 0.15), mix(DK, LT, 0.45), clamp(fil * 1.4 - 0.3));
        return [col[0], col[1], col[2], clamp(dens * 0.95)];
      }, "lighter");
      sun(C, C, 7 * u, 8, 5); twinkle(C, C, 28 * u, WHITE, 0.8);
      break;
    }
    case "pulsar": { // a tiny neutron star in a small wind nebula, sweeping two crisp beams; a magnetar wears loops of field
      field(ctx, W, (x, y) => { const dx = (x - C) / (60 * u), dy = (y - C) / (40 * u), f = Math.exp(-(dx * dx + dy * dy)); if (f < 0.02) return null; const w0 = fbm(x / (30 * u), y / (30 * u), 2, 4), v = ridged(x / (14 * u) + w0 * 3, y / (14 * u) + w0 * 3, 2.5, 4); return [...mix(LT, WHITE, 0.2), f * Math.pow(v, 2.2) * 0.75]; }, "lighter");
      ctx.save(); ctx.translate(C, C); ctx.rotate(-0.5); ctx.globalCompositeOperation = "lighter";
      for (const sgn of [-1, 1]) for (const [w, a] of [[16, 0.1], [5, 0.35], [1.4, 0.9]]) { const g = ctx.createLinearGradient(0, 0, 0, sgn * 150 * u); g.addColorStop(0, rgba(mix(LT, WHITE, 0.5), a)); g.addColorStop(1, rgba(LT, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-1.5 * u, 0); ctx.lineTo(-w * u, sgn * 150 * u); ctx.lineTo(w * u, sgn * 150 * u); ctx.lineTo(1.5 * u, 0); ctx.fill(); }
      if (fam.name === "Magnetar") { ctx.lineWidth = 1 * u; for (const k of [30, 46, 62, 80, 98]) { ctx.strokeStyle = rgba(mix(LT, WHITE, 0.3), 0.45 - k / 300); for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * k * 0.5 * u, 0, k * 0.5 * u, k * 0.2 * u, 0, 0, TAU); ctx.stroke(); } } }
      ctx.restore();
      sun(C, C, 6 * u, 6, 5); twinkle(C, C, 22 * u, WHITE, 0.9);
      break;
    }
    case "blackhole": { // the shadow, a thin photon ring and the accretion disk: far side bent over the top, near side in front, one side brighter (beaming)
      const hole = (x, y, sc) => {
        const R = 30 * u * sc, hot = mix(LT, WHITE, 0.55);
        const streaks = (rx, ry, from, to, n, wmax, grow = 0.9) => { ctx.save(); ctx.globalCompositeOperation = "lighter"; for (let i = 0; i < n; i++) { const k = i / n, a = (0.25 + 0.75 * Math.pow(n3(i * 0.9, 2, 5), 1.5)) * (1 - k * 0.6); const g = ctx.createLinearGradient(x - rx, y, x + rx, y); g.addColorStop(0, rgba(hot, a)); g.addColorStop(0.5, rgba(LT, a * 0.6)); g.addColorStop(1, rgba(mix(LT, DK, 0.4), a * 0.35)); ctx.strokeStyle = g; ctx.lineWidth = Math.max(0.6, wmax * (1 - k * 0.7) * u * sc); ctx.beginPath(); ctx.ellipse(x, y, rx * (1 + k * grow), ry * (1 + k * grow), -0.12, from, to); ctx.stroke(); } ctx.restore(); };
        bloom(x, y, R * 3.2, LT, 0.16);
        streaks(R * 1.25, R * 1.15, 0, TAU, 10, 1.5, 0.3); // the far side, lensed up over and under the shadow
        streaks(R * 1.9, R * 0.33, Math.PI, TAU, 18, 1.6); // the disk's far half, behind
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(WHITE, 0.9); ctx.lineWidth = Math.max(0.7, 1 * u * sc); ctx.beginPath(); ctx.arc(x, y, R * 1.03, 0, TAU); ctx.stroke(); // photon ring
        streaks(R * 1.9, R * 0.33, 0, Math.PI, 18, 1.6); // the near half, in front
      };
      if (fam.name.startsWith("Binary")) { hole(C - 48 * u, C - 18 * u, 0.55); hole(C + 48 * u, C + 18 * u, 0.55); } else hole(C, C, 1);
      break;
    }
    case "quasar": { // a blinding core in a host galaxy with spiral structure, two jets of crisp knots
      field(ctx, W, (x, y) => {
        const dx0 = x - C, dy0 = y - C, a0 = -0.4, dx = (dx0 * Math.cos(a0) + dy0 * Math.sin(a0)) / (110 * u), dy = (-dx0 * Math.sin(a0) + dy0 * Math.cos(a0)) / (46 * u), rr = Math.hypot(dx, dy); if (rr > 1.3) return null;
        const th = Math.atan2(dy, dx), arm = 0.5 + 0.5 * Math.cos(2 * th - rr * 9), v = fbm(dx * 6, dy * 6, 1, 4);
        const a = Math.exp(-rr * 2.6) * (0.35 + 0.65 * arm * v * 1.4); return [...mix(mix(DK, LT, 0.45), WHITE, Math.exp(-rr * 6) * 0.6), a * 1.1];
      }, "lighter");
      ctx.save(); ctx.translate(C, C); ctx.rotate(0.35); ctx.globalCompositeOperation = "lighter";
      for (const sgn of [-1, 1]) { for (const [w, a] of [[5, 0.14], [1.5, 0.7]]) { const g = ctx.createLinearGradient(0, 0, 0, sgn * 150 * u); g.addColorStop(0, rgba(mix(LT, WHITE, 0.6), a)); g.addColorStop(1, rgba(LT, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w * 0.2 * u, 0); ctx.lineTo(-w * u, sgn * 150 * u); ctx.lineTo(w * u, sgn * 150 * u); ctx.lineTo(w * 0.2 * u, 0); ctx.fill(); }
        for (let k = 1; k <= 5; k++) { const yk = sgn * (18 + k * 22 + r() * 8) * u; bloom(0, yk, (4 + r() * 3) * u, mix(LT, WHITE, 0.5), 0.6 - k * 0.08); } }
      ctx.restore();
      sun(C, C, 7 * u, 6, 6); twinkle(C, C, 34 * u, WHITE, 0.95);
      break;
    }
    case "nebula": { // domain-warped gas in two colours, cut by dark dust lanes, bright rims, young stars inside
      field(ctx, W, (x, y) => {
        const qx = x / (95 * u), qy = y / (95 * u), wx = fbm(qx, qy, 1.3, 4), wy = fbm(qx + 5.2, qy + 1.3, 2.1, 4);
        const d = fbm(qx + 2.2 * wx, qy + 2.2 * wy, 0.5, 6), fil = ridged(qx * 2 + wx * 1.5, qy * 2 + wy * 1.5, 3.3, 4);
        const ex = (x - C) / (150 * u), ey = (y - C) / (120 * u), fall = clamp(1.25 - Math.hypot(ex, ey)); if (fall <= 0) return null;
        const dust = clamp((fbm(qx * 1.7 + 9, qy * 1.7, 4.4, 5) - 0.53) * 6);
        const dens = Math.pow(clamp(d * 1.55 - 0.42), 1.5) * fall * (0.55 + fil * 0.9) * (1 - dust * 0.92);
        const col = mix(LT, mix(DK, LT, 0.35), clamp(wx * 1.6 - 0.5)), rim = Math.pow(fil, 4) * fall * (1 - dust) * 0.5;
        return [col[0] + 255 * rim, col[1] + 255 * rim, col[2] + 255 * rim, clamp(dens + rim)];
      }, "lighter");
      for (let i = 0; i < 6; i++) { const x = C + (r() - 0.5) * 170 * u, y = C + (r() - 0.5) * 130 * u; twinkle(x, y, (6 + r() * 10) * u, [232, 240, 255], 0.9); }
      break;
    }
    case "star": { const big = fam.name === "Red Giant"; sun(C, C, (big ? 64 : 24) * u, big ? 6 : 16, big ? 1.6 : 3.2); if (!big) twinkle(C, C, 60 * u, mix(LT, WHITE, 0.6), 0.7); break; }
  }
  // the version's finish: crisp, thin, never a haze over the object
  if (ver === "prismatic" && ctx.createConicGradient) {
    const g = ctx.createConicGradient(0, C, C); ["#F06A5A", "#F2B45A", "#6FD9A8", "#7FA6F5", "#B48CF2", "#F06A5A"].forEach((c, i) => g.addColorStop(i / 5, c));
    ctx.strokeStyle = g; for (const [w, a] of [[5, 0.16], [1.6, 0.9]]) { ctx.lineWidth = w * u; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(C, C, 120 * u, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  if (ver === "ancient") { // aged: a sepia cast over the picture and a thin golden ring
    ctx.globalCompositeOperation = bare ? "source-atop" : "color"; ctx.fillStyle = "rgba(170,120,60,.5)"; ctx.fillRect(0, 0, W, W); ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(233,196,106,.55)"; ctx.lineWidth = 1.2 * u; ctx.setLineDash([2 * u, 4 * u]); ctx.beginPath(); ctx.arc(C, C, 124 * u, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  if (ver === "mythic") { // a thin gold ring with a fainter twin and sharp gold glints around it
    for (const [rad, w, a] of [[124, 1.6, 0.95], [130, 0.8, 0.45]]) { ctx.strokeStyle = rgba([233, 196, 106], a); ctx.lineWidth = w * u; ctx.beginPath(); ctx.arc(C, C, rad * u, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 10; i++) { const a = r() * TAU, d = (108 + r() * 36) * u; twinkle(C + Math.cos(a) * d, C + Math.sin(a) * d, (4 + r() * 6) * u, [255, 236, 190], 0.95); }
  }
  ctx.restore();
}
