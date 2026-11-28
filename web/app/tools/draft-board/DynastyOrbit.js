"use client";

// The Dynasty Board's 3D view, "the accretion map" (founder, Nov 28 2026): the board as a black hole seen in three dimensions.
//   distance from the hole   = dynasty score (the best players orbit closest, the board's 10.0 sits at the inner edge)
//   position around the disk = age (a 300-degree sweep, youngest first; the gap holds the score ruler)
//   height above / below     = his score change over the last driftGames games (risers float up on cobalt stems, fallers sink on
//                              ember ones; the hole's two jets are that axis)
// The tiers are the bands on the disk and the groups the labelled orbits, the same tiers / groups as the 2D spread. Drag to orbit,
// the presets flatten it into two readable 2D views (Top = score x age, Edge-on = score x move). Drawn on one canvas, no library:
// the frame loop only runs while something moves (spin, drag, a camera preset, bodies settling after a filter) and the map is on
// screen. Filtered-out players stay as faint ghosts so the shape of the board doesn't jump.

import { useEffect, useMemo, useRef, useState } from "react";
import { MOVE_MIN } from "@/lib/dynastyBoard";
import { createBlackHole } from "./blackHoleGL";

const SWEEP = (300 / 180) * Math.PI; // the age arc; the 60-degree gap left over is where the score ruler sits
const GAP_MID = -Math.PI / 2; // the ruler points at the viewer when the camera's azimuth is 0
const A0 = GAP_MID + (Math.PI * 2 - SWEEP) / 2; // the arc starts just after the gap and runs anticlockwise
const R_IN = 0.2, R_OUT = 1, H_MAX = 0.46, FOCAL = 3.4;
// the ray-traced hole (blackHoleGL.js): Schwarzschild radius in world units, the glowing disk from the innermost stable orbit
// (3 rs) out to 12 rs, about half the data disk, so its fire fades out under the middle tiers; its shadow is 2.6 rs across, which is where the 2D fallback draws its hole
const RS = 0.045, DISK_IN = 3, DISK_OUT = 12, HOLE = 2.6 * RS;
// camera presets: Top reads score (in / out) against age (round the dial) with the ruler at the bottom; Edge-on turns the ruler
// sideways and looks along the disk, so height (the move) is all you see
const PRESETS = { orbit: { el: 0.52, az: -0.8, label: "Orbit" }, top: { el: 1.5, az: 0, label: "Top" }, edge: { el: 0.03, az: Math.PI / 2, label: "Edge-on" } };
const SUFFIX = /\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i;
const lastName = (n) => n.replace(SUFFIX, "").split(" ").slice(-1)[0].toUpperCase();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// a star as light, not a dot: a hot core in a soft halo, drawn once per colour and stamped with drawImage
const SPRITES = new Map();
function sprite(rgb) {
  if (SPRITES.has(rgb)) return SPRITES.get(rgb);
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.12, `rgba(${rgb},0.95)`);
  r.addColorStop(0.3, `rgba(${rgb},0.32)`);
  r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  SPRITES.set(rgb, c);
  return c;
}
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// theme colours, read from the page (both themes; re-read when the theme changes)
function readTheme(el) {
  const s = getComputedStyle(el);
  const v = (n) => s.getPropertyValue(n).trim();
  return {
    star: v("--star") || "#ECE7DC", dim: v("--star-dim") || "#A39E92", up: v("--up") || "#4C7DF0", down: v("--down") || "#E8643F",
    ember: v("--ember") || "#E8643F", panel: v("--void-panel") || "#131210", dot: v("--star-dot-rgb") || "236,231,220",
    upRgb: v("--up-rgb") || "76,125,240", downRgb: v("--down-rgb") || "232,100,63", emberRgb: v("--ember-rgb") || "232,100,63",
    mono: v("--font-mono") || "monospace", light: false, // the map is always a dark window onto space (its own palette in the CSS)
  };
}

// a fixed sky behind the map (same stars every visit), points on a big sphere that turn with the camera
const SKY = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 260 }, () => {
    const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    return { x: r * Math.cos(t), y: r * Math.sin(t), z: u, a: 0.12 + rnd() * 0.5, s: rnd() < 0.08 ? 1.6 : 1 };
  });
})();

export default function DynastyOrbit({ L, tiers, groups, hit, openId, onPick }) {
  const wrapRef = useRef(null), canvasRef = useRef(null), hudRef = useRef(null), hud2Ref = useRef(null), glRef = useRef(null), bloomRef = useRef(null);
  const [hover, setHover] = useState(null); // the player under the pointer (for the readout card)
  const [spin, setSpin] = useState(true);
  const [preset, setPreset] = useState("orbit");

  // ---- the board laid into the map: score -> radius, age -> angle, move -> height (recomputed when the view or filters change)
  const geo = useMemo(() => {
    if (!L.length) return null;
    const sHi = Math.max(...L.map((p) => p.score)), sLo = Math.min(...L.map((p) => p.score));
    const aLo = Math.floor(Math.min(...L.map((p) => p.age))), aHi = Math.ceil(Math.max(...L.map((p) => p.age)));
    const mMax = Math.max(2, Math.ceil(Math.max(...L.map((p) => Math.abs(p.move || 0)))));
    const rOf = (s) => R_IN + ((sHi - s) / (sHi - sLo || 1)) * (R_OUT - R_IN);
    const tOf = (a) => A0 + ((a - aLo) / (aHi - aLo || 1)) * SWEEP;
    const zOf = (m) => ((m || 0) / mMax) * H_MAX;
    const bodies = L.map((p, i) => {
      const r = rOf(p.score), t = tOf(p.age);
      return { p, i, rank: i + 1, x: r * Math.cos(t), y: r * Math.sin(t), z: zOf(p.move), shown: !hit || hit[i] };
    });
    // a tier's band runs from halfway to the tier above to halfway to the tier below
    const edge = (a, b) => (a < 0 ? R_IN - 0.03 : b >= L.length ? R_OUT + 0.03 : (rOf(L[a].score) + rOf(L[b].score)) / 2);
    const bands = tiers.map((t) => ({ r0: edge(t.a - 1, t.a), r1: edge(t.b, t.b + 1), g: t.g }));
    const orbits = groups.map((g) => ({ r0: edge(g.a - 1, g.a), r1: edge(g.b, g.b + 1), name: g.name }));
    const ticks = [];
    const every = sHi - sLo > 8 ? 2 : 1; // a long ruler is labelled every other point (the 10.0 at the horizon always)
    for (let s = Math.floor(sHi); s >= Math.ceil(sLo); s -= every) ticks.push({ s, r: rOf(s) });
    const ages = [];
    for (let a = aLo + ((aLo % 2) ? 1 : 0); a <= aHi; a += 2) ages.push({ a, t: tOf(a) });
    const zt = [];
    for (let m = 1; m <= mMax; m++) if (mMax <= 4 || m % 2 === 0 || m === mMax) zt.push(m);
    const shown = bodies.filter((b) => b.shown && b.p.move != null);
    const riser = shown.reduce((m, b) => (b.p.move >= MOVE_MIN && (!m || b.p.move > m.p.move) ? b : m), null);
    const faller = shown.reduce((m, b) => (b.p.move <= -MOVE_MIN && (!m || b.p.move < m.p.move) ? b : m), null);
    const ageMed = [...L.map((p) => p.age)].sort((a, b) => a - b)[Math.floor(L.length / 2)];
    return { bodies, bands, orbits, ticks, ages, zt, mMax, zOf, sHi, sLo, aLo, aHi, riser, faller, ageMed, nShown: bodies.filter((b) => b.shown).length };
  }, [L, tiers, groups, hit]);

  // everything the frame loop reads lives in one ref, so the loop never needs a React render
  const st = useRef({ az: -0.8, el: 0.52, zoom: 1, elGoal: null, azGoal: null, vAz: 0, drag: null, pos: new Map(), dirty: true, theme: null, w: 0, h: 0, dpr: 1, hoverId: null, openId: null, spin: true, last: 0, bh: null, time: 0, glScale: 1, slow: 0, onScreen: true, raf: 0, scr: [] });
  st.current.openId = openId;
  st.current.spin = spin && !reduced();

  // a new view moves the bodies to their new places (they glide there; on the first frame they fall in from outside)
  useEffect(() => {
    const S = st.current;
    if (!geo) return;
    const still = reduced();
    for (const b of geo.bodies) {
      const cur = S.pos.get(b.p.id);
      if (!cur || still) S.pos.set(b.p.id, cur && still ? { x: b.x, y: b.y, z: b.z, a: b.shown ? 1 : 0.13 } : cur || { x: b.x * 2.6 - b.y * 0.9, y: b.y * 2.6 + b.x * 0.9, z: b.z * 3, a: 0 });
    }
    S.dirty = true;
    wake();
  }, [geo]);  
  useEffect(() => { st.current.dirty = true; wake(); }, [openId, spin]);  

  // ---- the camera: world (x, y on the disk, z up) -> screen
  function project(x, y, z) {
    const S = st.current;
    const ca = Math.cos(S.az), sa = Math.sin(S.az), ce = Math.cos(S.el), se = Math.sin(S.el);
    const x1 = x * ca - y * sa, y1 = x * sa + y * ca;
    const up = z * ce + y1 * se, toward = -y1 * ce + z * se;
    const k = FOCAL / (FOCAL - toward), sc = scaleOf(S), cy = centreY(S);
    return { x: S.w / 2 + x1 * k * sc, y: cy - up * k * sc, d: toward, k, sc };
  }
  // the disk fills the frame at every tilt: looking down, its full depth is on screen; edge-on, only the jets' height is
  function scaleOf(S) { return Math.min(S.w * (S.w < 560 ? 0.42 : 0.37), (S.h * 0.46) / (1.25 * Math.sin(S.el) + 0.35 * Math.cos(S.el))) * S.zoom; }
  function centreY(S) { return S.h * (S.w < 560 ? 0.56 : 0.53); }

  function draw() {
    const S = st.current, c = canvasRef.current, T = S.theme;
    if (!c || !T || !geo) return false;
    const ctx = c.getContext("2d");
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.clearRect(0, 0, S.w, S.h);
    const rgba = (rgb, a) => `rgba(${rgb},${a})`;
    const font = (px, w = 400) => `${w} ${px}px ${T.mono}`;

    // the sky: far stars turning with the camera (direction only, so they never get closer)
    const ca = Math.cos(S.az), sa = Math.sin(S.az), ce = Math.cos(S.el), se = Math.sin(S.el), R = Math.hypot(S.w, S.h) * 0.62;
    if (!S.bh) for (const s of SKY) { // the ray-traced layer has its own (lensed) sky
      const x1 = s.x * ca - s.y * sa, y1 = s.x * sa + s.y * ca, up = s.z * ce + y1 * se, tw = -y1 * ce + s.z * se;
      if (tw > 0.2) continue; // only the half of the sky behind the map
      ctx.fillStyle = rgba(T.dot, s.a * (T.light ? 0.5 : 1));
      ctx.fillRect(S.w / 2 + x1 * R, S.h * 0.55 - up * R, s.s, s.s);
    }

    // an arc of the disk (angles a0..a1, radius r) as a projected polyline
    const arc = (r, a0, a1, z = 0, n = 72, move = true) => {
      for (let i = 0; i <= n; i++) {
        const t = a0 + ((a1 - a0) * i) / n, q = project(r * Math.cos(t), r * Math.sin(t), z);
        if (i === 0 && move) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
    };
    const A1 = A0 + SWEEP;

    // bodies sort into below-the-disk (drawn first, dimmed when seen from above) and the rest
    const frame = geo.bodies.map((b) => {
      const P = S.pos.get(b.p.id) || { x: b.x, y: b.y, z: b.z, a: 1 };
      return { b, P, q: project(P.x, P.y, P.z), base: project(P.x, P.y, 0) };
    });
    const below = frame.filter((f) => f.P.z < -0.001).sort((m, n) => m.q.d - n.q.d);
    const above = frame.filter((f) => f.P.z >= -0.001);

    const drawBody = (f, dimmed) => {
      const { b, P, q, base } = f;
      const isOpen = b.p.id === S.openId, isHover = b.p.id === S.hoverId;
      const a = P.a * (dimmed ? 0.55 : 1);
      if (a < 0.02) return;
      // nothing behind the hole shows through its shadow
      if (q.d < 0 && Math.hypot(q.x - S.w / 2, q.y - centreY(S)) < HOLE * q.sc * 1.05) return;
      const mv = b.p.move || 0, big = Math.abs(mv) >= MOVE_MIN;
      // the stem down (or up) to the disk, and his shadow on it
      if (Math.abs(P.z) > 0.004) {
        const g = ctx.createLinearGradient(base.x, base.y, q.x, q.y);
        const rgb = big ? (mv > 0 ? T.upRgb : T.downRgb) : T.dot;
        g.addColorStop(0, rgba(rgb, 0.05 * a));
        g.addColorStop(1, rgba(rgb, (big ? 0.85 : 0.3) * a));
        ctx.strokeStyle = g;
        ctx.lineWidth = big ? 1.4 : 1;
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.fillStyle = rgba(T.dot, 0.22 * a);
        ctx.fillRect(base.x - 1, base.y - 1, 2, 2);
      }
      const rad = clamp(2.3 * q.k, 1.4, 4) * (b.shown ? 1 : 0.7);
      if (S.bh) { // over the ray-traced disk the players are points of light, added to the light behind them
        const rgb = isOpen ? T.emberRgb : big ? (mv > 0 ? T.upRgb : T.downRgb) : "236,231,220";
        const size = rad * (isOpen ? 9 : big ? 6.5 : 4.6) * (b.shown ? 1 : 0.6);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = a * (b.shown ? 1 : 0.5);
        ctx.drawImage(sprite(rgb), q.x - size / 2, q.y - size / 2, size, size);
        if (b.shown && (big || isOpen)) { // diffraction spikes on the movers, like a telescope's bright stars
          const L2 = size * (isOpen ? 0.9 : 0.6);
          ctx.strokeStyle = `rgba(${rgb},${0.55 * a})`; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(q.x - L2, q.y); ctx.lineTo(q.x + L2, q.y); ctx.moveTo(q.x, q.y - L2); ctx.lineTo(q.x, q.y + L2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        if (isOpen || isHover) {
          ctx.strokeStyle = isOpen ? T.ember : T.star;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(q.x - rad - 4, q.y - rad - 4, rad * 2 + 8, rad * 2 + 8);
        }
        return;
      }
      if (b.shown && (isOpen || isHover || big)) { // a soft halo on the movers and the picked player
        const hr = rad * (isOpen ? 5 : 3.2);
        const h = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, hr);
        const rgb = isOpen ? T.emberRgb : big ? (mv > 0 ? T.upRgb : T.downRgb) : T.dot;
        h.addColorStop(0, rgba(rgb, 0.45 * a)); h.addColorStop(1, rgba(rgb, 0));
        ctx.fillStyle = h; ctx.beginPath(); ctx.arc(q.x, q.y, hr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = isOpen ? T.ember : b.shown ? T.star : rgba(T.dot, 0.5);
      ctx.globalAlpha = a;
      ctx.fillRect(q.x - rad, q.y - rad, rad * 2, rad * 2); // square stars, like the 2D marks
      ctx.globalAlpha = 1;
      if (isOpen || isHover) {
        ctx.strokeStyle = isOpen ? T.ember : T.star;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(q.x - rad - 3, q.y - rad - 3, rad * 2 + 6, rad * 2 + 6);
      }
    };
    for (const f of below) drawBody(f, S.el > 0.08);

    // the disk: tier bands (alternating, like the 2D spread), a faint wash under the whole sweep
    ctx.lineWidth = 1;
    geo.bands.forEach((bd, i) => {
      ctx.beginPath();
      arc(bd.r1, A0, A1);
      arc(bd.r0, A1, A0, 0, 72, false);
      ctx.closePath();
      ctx.fillStyle = rgba(T.dot, S.bh ? (i % 2 ? 0.035 : 0.01) : i % 2 ? 0.075 : 0.03);
      ctx.fill();
      ctx.strokeStyle = rgba(T.dot, S.bh ? 0.11 : 0.16);
      ctx.beginPath(); arc(bd.r0, A0, A1); ctx.stroke();
    });
    // the groups: brighter orbits at each group's outer edge, named in the gap beside the ruler
    ctx.font = font(9.5);
    const glabels = geo.orbits.map((o) => {
      ctx.strokeStyle = rgba(T.dot, S.bh ? 0.32 : 0.5);
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); arc(o.r1, A0 - 0.06, A1 + 0.06, 0, 90); ctx.stroke();
      ctx.setLineDash([]);
      const mid = (o.r0 + o.r1) / 2, t = A0 - 0.045;
      const q = project(mid * Math.cos(t), mid * Math.sin(t), 0);
      return { text: o.name.toUpperCase(), x: q.x + 7, y: q.y };
    });
    // the group names sit beside the ruler; pushed apart vertically so none overlap however the disk is turned
    glabels.sort((m, n) => m.y - n.y);
    for (let i = 1; i < glabels.length; i++) glabels[i].y = Math.max(glabels[i].y, glabels[i - 1].y + 11);
    ctx.fillStyle = rgba(T.dot, 0.8); ctx.textAlign = "left"; ctx.textBaseline = "middle";
    if (S.w >= 560) for (const g of glabels) ctx.fillText(g.text, g.x, g.y); // too dense to read on a phone; the list's headings name the groups
    // the score ruler down the middle of the gap, and the age dial round the rim
    const rim = R_OUT + 0.07;
    ctx.strokeStyle = rgba(T.dot, 0.55);
    ctx.beginPath();
    { const a = project(R_IN * Math.cos(GAP_MID), R_IN * Math.sin(GAP_MID), 0), b = project(rim * Math.cos(GAP_MID), rim * Math.sin(GAP_MID), 0); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
    ctx.font = font(9.5); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const tk of geo.ticks) {
      const q = project(tk.r * Math.cos(GAP_MID), tk.r * Math.sin(GAP_MID), 0);
      ctx.fillStyle = T.star; ctx.fillRect(q.x - 2, q.y - 0.5, 4, 1);
      ctx.fillStyle = rgba(T.dot, 0.85); ctx.fillText(String(tk.s), q.x - 12, q.y);
    }
    { const q = project(rim * 1.06 * Math.cos(GAP_MID), rim * 1.06 * Math.sin(GAP_MID), 0); ctx.font = font(9, 700); ctx.fillStyle = T.star; ctx.fillText("SCORE", q.x, q.y + 8); }
    ctx.strokeStyle = rgba(T.dot, 0.6);
    ctx.beginPath(); arc(rim, A0, A1, 0, 120); ctx.stroke();
    ctx.font = font(9.5);
    for (const ag of geo.ages) {
      const a = project(rim * Math.cos(ag.t), rim * Math.sin(ag.t), 0), b = project((rim + 0.03) * Math.cos(ag.t), (rim + 0.03) * Math.sin(ag.t), 0), l = project((rim + 0.09) * Math.cos(ag.t), (rim + 0.09) * Math.sin(ag.t), 0);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = rgba(T.dot, 0.85); ctx.fillText(String(ag.a), l.x, l.y);
    }
    { const t = A0 + 0.16, q = project((rim + 0.2) * Math.cos(t), (rim + 0.2) * Math.sin(t), 0); ctx.font = font(9, 700); ctx.fillStyle = T.star; ctx.fillText("AGE →", q.x, q.y); } // at the youngest end, pointing the way ages run

    // the hole, its accretion glow and the two jets (the move axis), sorted in with the bodies above the disk
    const drawHole = () => {
      const c0 = project(0, 0, 0);
      if (!S.bh) for (let i = 10; i >= 1; i--) { // the glow: projected rings, hottest at the horizon (the 2D fallback only)
        const r = HOLE + (i / 10) * 0.085;
        ctx.strokeStyle = rgba(T.emberRgb, 0.05 + (1 - i / 10) * 0.22);
        ctx.lineWidth = 2.2;
        ctx.beginPath(); arc(r, 0, Math.PI * 2, 0, 64); ctx.stroke();
      }
      const jet = (dir, rgb, label) => {
        const top = project(0, 0, dir * (H_MAX + 0.12));
        // a relativistic jet: a wide faint sheath and a hot thin core, added as light, fading with height
        ctx.globalCompositeOperation = "lighter";
        for (const [wd, al] of S.bh ? [[14, 0.06], [6, 0.16], [2, 0.75], [0.8, 1]] : [[2, 0.9]]) {
          const g = ctx.createLinearGradient(c0.x, c0.y, top.x, top.y);
          g.addColorStop(0, rgba(rgb, al)); g.addColorStop(0.7, rgba(rgb, al * 0.35)); g.addColorStop(1, rgba(rgb, 0));
          ctx.strokeStyle = g; ctx.lineWidth = wd; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(top.x, top.y); ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over"; ctx.lineCap = "butt";
        ctx.font = font(9); ctx.textAlign = "left"; ctx.textBaseline = "middle";
        for (const m of geo.zt) {
          const q = project(0, 0, dir * geo.zOf(m));
          ctx.fillStyle = rgba(rgb, 0.95); ctx.fillRect(q.x - 3, q.y - 0.5, 6, 1);
          ctx.fillText(`${dir > 0 ? "+" : "−"}${m}`, q.x + 6, q.y);
        }
        const lq = project(0, 0, dir * (H_MAX + 0.16));
        ctx.font = font(9, 700); ctx.textAlign = "center"; ctx.fillStyle = rgba(rgb, 1);
        ctx.fillText(label, lq.x, lq.y);
      };
      const jets = S.el < 1.3; // looking straight down, the jets collapse onto the hole; the readout card carries the move instead
      if (jets && S.el > 0.06) jet(-1, T.downRgb, "FALLING");
      if (!S.bh) {
        ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.arc(c0.x, c0.y, HOLE * c0.k * c0.sc, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(T.emberRgb, 0.95); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(c0.x, c0.y, HOLE * c0.k * c0.sc + 1.5, 0, Math.PI * 2); ctx.stroke();
      }
      if (jets) jet(1, T.upRgb, "CLIMBING");
      if (jets && S.el <= 0.06) jet(-1, T.downRgb, "FALLING");
    };
    const items = above.map((f) => ({ d: f.q.d, f })).concat([{ d: 0, hole: true }]).sort((m, n) => m.d - n.d);
    for (const it of items) it.hole ? drawHole() : drawBody(it.f, false);

    // callouts: the biggest climb and the biggest fall on this view, and the picked player's name
    const tag = (b, text, rgb) => {
      const P = S.pos.get(b.p.id); if (!P || P.a < 0.5) return;
      const q = project(P.x, P.y, P.z);
      ctx.font = font(10, 700); ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const w = ctx.measureText(text).width + 10, flip = q.x + 12 + w > S.w - 4; // a tag that would run off the right edge points left instead
      const x = flip ? q.x - 12 - w : q.x + 12, y = q.y - 14;
      ctx.strokeStyle = rgba(rgb, 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(q.x + (flip ? -4 : 4), q.y - 4); ctx.lineTo(flip ? x + w : x, y); ctx.stroke();
      ctx.fillStyle = T.panel; ctx.fillRect(x, y - 8, w, 16);
      ctx.strokeRect(x + 0.5, y - 7.5, w - 1, 15);
      ctx.fillStyle = rgba(rgb, 1); ctx.fillText(text, x + 5, y + 0.5);
    };
    const open = geo.bodies.find((b) => b.p.id === S.openId && b.shown);
    if (geo.riser && geo.riser !== open) tag(geo.riser, `▲ ${lastName(geo.riser.p.name)} +${geo.riser.p.move.toFixed(1)}`, T.upRgb);
    if (geo.faller && geo.faller !== open) tag(geo.faller, `▼ ${lastName(geo.faller.p.name)} −${Math.abs(geo.faller.p.move).toFixed(1)}`, T.downRgb);
    if (open) tag(open, `${open.rank}. ${open.p.name.toUpperCase()}`, T.emberRgb);

    S.scr = frame.filter((f) => f.b.shown && f.P.a > 0.5).map((f) => ({ id: f.b.p.id, x: f.q.x, y: f.q.y, d: f.q.d }));
    return true;
  }

  // ---- the frame loop: advances the camera and the bodies, redraws, and stops itself once nothing moves
  function tick() {
    const S = st.current;
    S.raf = 0;
    if (!geo || !S.onScreen || document.hidden) { S.last = 0; return; }
    // every motion is per millisecond, so it runs at the same speed on a slow screen or a throttled tab (f = one 60fps frame)
    const now = performance.now(), raw = S.last ? now - S.last : 16.7, dt = Math.min(80, raw), f = dt / 16.7;
    S.last = now;
    const ease = (tau) => 1 - Math.exp(-dt / tau);
    let moving = false;
    if (S.drag) moving = true;
    else if (Math.abs(S.vAz) > 0.0004) { S.az += S.vAz * f; S.vAz *= Math.pow(0.93, f); moving = true; }
    else if (S.spin) { S.az += 0.0022 * f; moving = true; }
    if (S.azGoal != null) {
      S.az += (S.azGoal - S.az) * ease(130);
      if (Math.abs(S.azGoal - S.az) < 0.002) { S.az = S.azGoal; S.azGoal = null; }
      moving = true;
    }
    if (S.elGoal != null) {
      S.el += (S.elGoal - S.el) * ease(130);
      if (Math.abs(S.elGoal - S.el) < 0.002) { S.el = S.elGoal; S.elGoal = null; }
      moving = true;
    }
    const kPos = ease(180), kA = ease(130);
    for (const b of geo.bodies) {
      const P = S.pos.get(b.p.id);
      if (!P) continue;
      const ta = b.shown ? 1 : 0.13;
      const dx = b.x - P.x, dy = b.y - P.y, dz = b.z - P.z, da = ta - P.a;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) + Math.abs(da) > 0.0015) {
        P.x += dx * kPos; P.y += dy * kPos; P.z += dz * kPos; P.a += da * kA;
        moving = true;
      } else { P.x = b.x; P.y = b.y; P.z = b.z; P.a = ta; }
    }
    // the ray-traced hole is alive (its disk turns) whenever motion is allowed, so it renders every frame; the data layer only
    // redraws when the camera or the players move
    const live = !!S.bh && !reduced();
    if (live) {
      S.time += dt / 1000;
      S.slow++;
    }
    // a slow GPU gets a coarser ray-traced layer (the data layer stays sharp). Frame timing can't tell (a screen or tab may cap
    // the frame rate), so every ~2 seconds one frame is timed for real: over 14ms steps the resolution down, under 5ms back up
    if (S.bh && live && S.slow >= 120) {
      S.slow = 0;
      const ms = renderGL(true);
      if (ms > 14 && S.glScale > 0.45) { S.glScale *= 0.8; sizeGL(); }
      else if (ms < 5 && S.glScale < S.glMax) { S.glScale = Math.min(S.glMax, S.glScale * 1.15); sizeGL(); }
    } else if (S.bh && (live || moving || S.dirty)) renderGL();
    if (moving || S.dirty) {
      draw();
      S.dirty = false;
      const h = hudRef.current;
      if (h) h.textContent = `AZ ${(((((S.az * 180) / Math.PI) % 360) + 360) % 360).toFixed(1).padStart(5, "0")}°  EL ${((S.el * 180) / Math.PI).toFixed(1).padStart(4, "0")}°  ZOOM ${S.zoom.toFixed(2)}×`;
      const h2 = hud2Ref.current;
      if (h2) h2.textContent = S.bh ? `INCL ${(90 - (S.el * 180) / Math.PI).toFixed(1)}° · LENSING · DOPPLER · RS ${RS.toFixed(3)} · ISCO ${DISK_IN} RS` : "";
    }
    if (moving || live) S.raf = requestAnimationFrame(loop.current);
    else S.last = 0; // the next wake starts a fresh clock
  }
  function sizeGL() {
    const S = st.current, g = glRef.current, b = bloomRef.current;
    if (!g) return;
    g.width = Math.max(2, Math.round(S.w * S.glScale)); g.height = Math.max(2, Math.round(S.h * S.glScale));
    if (b) { b.width = Math.max(2, Math.round(S.w / 6)); b.height = Math.max(2, Math.round(S.h / 6)); }
    S.dirty = true;
  }
  function renderGL(timed = false) {
    const S = st.current;
    const ms = S.bh[timed ? "timed" : "render"]({ cssW: S.w, cssH: S.h, cx: S.w / 2, cy: centreY(S), sc: scaleOf(S), focal: FOCAL, rs: RS, az: S.az, el: S.el, time: S.time, rin: DISK_IN, rout: DISK_OUT });
    const b = bloomRef.current; // bloom: a tiny copy of the frame, blurred and screened over it in CSS
    if (b) b.getContext("2d").drawImage(glRef.current, 0, 0, b.width, b.height);
    return ms;
  }
  // the scheduled frame always runs the LATEST render's tick (a running loop would otherwise keep drawing an old board)
  const tickRef = useRef(tick);
  tickRef.current = tick;
  const loop = useRef(() => tickRef.current());
  function wake() {
    const S = st.current;
    if (!S.raf) S.raf = requestAnimationFrame(loop.current);
  }

  // ---- size, theme, visibility
  useEffect(() => {
    const S = st.current, wrap = wrapRef.current, c = canvasRef.current;
    if (!S.bh && glRef.current) {
      S.bh = createBlackHole(glRef.current);
      // render resolution: sharp on a desktop, a little coarser on a high-density phone (the GPU traces every pixel)
      S.glScale = S.glMax = clamp((window.devicePixelRatio || 1) * 0.75, 0.75, 1.25);
    }
    const fit = () => {
      const r = c.getBoundingClientRect();
      S.w = r.width; S.h = r.height; S.dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(S.w * S.dpr); c.height = Math.round(S.h * S.dpr);
      if (S.bh) sizeGL();
      S.dirty = true; wake();
    };
    const retheme = () => { S.theme = readTheme(wrap); S.dirty = true; wake(); };
    retheme(); fit();
    document.fonts?.ready.then(retheme);
    const ro = new ResizeObserver(fit); ro.observe(c);
    const mo = new MutationObserver(retheme); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia("(prefers-color-scheme: light)"); mq.addEventListener?.("change", retheme);
    const io = new IntersectionObserver(([e]) => { S.onScreen = e.isIntersecting; if (S.onScreen) wake(); }); io.observe(c);
    const vis = () => !document.hidden && wake(); document.addEventListener("visibilitychange", vis);
    return () => { ro.disconnect(); mo.disconnect(); io.disconnect(); mq.removeEventListener?.("change", retheme); document.removeEventListener("visibilitychange", vis); cancelAnimationFrame(S.raf); S.raf = 0; S.bh?.dispose(); S.bh = null; };
  }, []);  

  // ---- pointer: drag to orbit (with a little inertia), hover to read a player, click to open him
  const pick = (e) => {
    const r = canvasRef.current.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 13 * 13;
    for (const s of st.current.scr) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd || (d === bd && best && s.d > best.d)) { bd = d; best = s; } }
    return best?.id || null;
  };
  const onDown = (e) => {
    const S = st.current;
    canvasRef.current.setPointerCapture?.(e.pointerId);
    S.drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() };
    S.vAz = 0; S.elGoal = null; S.azGoal = null; wake();
  };
  const onMove = (e) => {
    const S = st.current;
    if (S.drag) {
      const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
      S.drag.x = e.clientX; S.drag.y = e.clientY;
      S.az -= dx * 0.008; S.vAz = -dx * 0.0035; // a gentle coast after letting go
      S.el = clamp(S.el + dy * 0.006, 0.02, 1.52);
      if (Math.abs(S.drag.x - S.drag.x0) + Math.abs(S.drag.y - S.drag.y0) > 4) setPreset(null);
      return;
    }
    const id = pick(e);
    if (id !== S.hoverId) { S.hoverId = id; S.dirty = true; wake(); setHover(id); }
  };
  const onUp = (e) => {
    const S = st.current, d = S.drag;
    S.drag = null;
    if (d && Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < 5) { S.vAz = 0; const id = pick(e); if (id) onPick(id); }
    if (reduced()) S.vAz = 0;
    wake();
  };
  const onLeave = () => { const S = st.current; if (!S.drag && S.hoverId) { S.hoverId = null; S.dirty = true; wake(); setHover(null); } };
  const zoomBy = (f) => { const S = st.current; S.zoom = clamp(S.zoom * f, 0.6, 2.6); S.dirty = true; wake(); };
  const goPreset = (k) => {
    const S = st.current, P = PRESETS[k];
    setPreset(k);
    // turn the short way round to the preset's azimuth
    S.azGoal = S.az + ((((P.az - S.az) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    S.elGoal = P.el; S.vAz = 0;
    if (k !== "orbit") setSpin(false);
    wake();
  };
  // trackpad pinch (ctrl + wheel) zooms; a plain wheel keeps scrolling the page
  useEffect(() => {
    const c = canvasRef.current;
    const onWheel = (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.01)); };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onKey = (e) => {
    const S = st.current, k = e.key;
    if (k === "ArrowLeft") S.az += 0.12; else if (k === "ArrowRight") S.az -= 0.12;
    else if (k === "ArrowUp") S.el = clamp(S.el + 0.08, 0.02, 1.52); else if (k === "ArrowDown") S.el = clamp(S.el - 0.08, 0.02, 1.52);
    else if (k === "+" || k === "=") return zoomBy(1.15); else if (k === "-") return zoomBy(1 / 1.15);
    else return;
    e.preventDefault(); setPreset(null); S.dirty = true; wake();
  };

  if (!geo) return null;
  const hb = hover && geo.bodies.find((b) => b.p.id === hover);
  const hp = hb?.p;
  const Readout = hp && (
    <div className="dyo-card mono" aria-live="polite">
      <div className="dyo-card-name">{hb.rank}. {hp.name}</div>
      <div className="dyo-card-sub">{hp.pos} · {hp.team || "FA"} · {hp.age.toFixed(1)} yrs</div>
      <dl>
        <dt>Score</dt><dd>{hp.score.toFixed(1)}</dd>
        <dt>9-game move</dt><dd className={hp.move >= MOVE_MIN ? "is-up" : hp.move <= -MOVE_MIN ? "is-down" : ""}>{hp.move == null ? "—" : `${hp.move > 0 ? "+" : hp.move < 0 ? "−" : ""}${Math.abs(hp.move).toFixed(1)}`}</dd>
        <dt>Rank</dt><dd>{hp.prevRank && hp.prevRank !== hb.rank ? <>{hp.prevRank} → <b className={hp.prevRank > hb.rank ? "is-up" : "is-down"}>{hb.rank}</b></> : hb.rank}</dd>
      </dl>
    </div>
  );

  return (
    <div className="dyo" ref={wrapRef}>
      <canvas ref={glRef} className="dyo-gl" aria-hidden="true" />
      <canvas ref={bloomRef} className="dyo-bloom" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="dyo-canvas"
        tabIndex={0}
        role="img"
        aria-label={`Three-dimensional map of ${geo.nShown} players: distance from the center is dynasty score, the angle around it is age, height is the score change over the last nine games. Drag or use the arrow keys to turn it; click a player to open his profile.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onLeave}
        onKeyDown={onKey}
        style={{ cursor: hover ? "pointer" : "grab" }}
      />
      <div className="dyo-hud dyo-hud-tl mono" aria-hidden="true">
        <b>Accretion map</b>
        <span ref={hudRef} />
        <span ref={hud2Ref} />
        <span>BODIES {String(geo.nShown).padStart(3, "0")} / {String(geo.bodies.length).padStart(3, "0")} · RINGS {geo.bands.length} · ORBITS {geo.orbits.length}</span>
        <span>HORIZON {geo.sHi.toFixed(1)} · RIM {geo.sLo.toFixed(1)} · AGE {geo.aLo}–{geo.aHi} · MEDIAN {geo.ageMed.toFixed(1)}</span>
      </div>
      <div className="dyo-hud dyo-hud-tr">
        <div className="board-toggle dyo-presets" role="group" aria-label="Camera">
          {Object.entries(PRESETS).map(([k, v]) => (
            <button key={k} type="button" className={preset === k ? "active" : ""} aria-pressed={preset === k} onClick={() => goPreset(k)}>{v.label}</button>
          ))}
        </div>
        <div className="dyo-tools">
          <button type="button" className={`dyo-btn${spin ? " is-on" : ""}`} aria-pressed={spin} onClick={() => setSpin((v) => !v)}>{spin ? "Spin on" : "Spin off"}</button>
          <button type="button" className="dyo-btn" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>+</button>
          <button type="button" className="dyo-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}>−</button>
        </div>
      </div>
      <ul className="dyo-hud dyo-legend mono">
        <li><i className="dyo-k dyo-k-r" />Closer to the hole = higher dynasty score</li>
        <li><i className="dyo-k dyo-k-a" />Around the disk = age, youngest first</li>
        <li><i className="dyo-k dyo-k-z" />Above / below = score up / down, last 9 games</li>
        <li><i className="dyo-k dyo-k-t" />Rings = tiers · dashed orbits = groups</li>
      </ul>
      <div className="dyo-hud dyo-hud-br">{Readout || <span className="dyo-hint mono">Drag to orbit · pinch to zoom · click a star to open him</span>}</div>
    </div>
  );
}
