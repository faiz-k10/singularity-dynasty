"use client";

import { renderToStaticMarkup } from "react-dom/server";
import { FAMILIES, COLOURS, skyFor, seasonProgress, COLORS as STAR } from "@/lib/nightSky";
import { SkyBackdrop, CoreSkin } from "./skins";

// The Night Sky's pictures (from mockups/night-sky.html, which the founder approved): one renderer per kind of object, coloured by the find's
// colour and finished by its version, drawn on a canvas; the telescope reveal (the picture sharpens out of noise); and the share cards.
export function drawObject(ctx, W, find, edge) {
  const fam = FAMILIES[find.fam], pal = COLOURS.find((c) => c.id === find.colour).c, ver = find.version;
  let s = 11 + find.fam * 97; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.save();
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < W * 0.4; i++) { ctx.fillStyle = `rgba(236,231,220,${0.12 + r() * 0.45})`; ctx.fillRect(r() * W, r() * W, Math.max(1, W / 260), Math.max(1, W / 260)); }
  const C = W / 2, u = W / 320;
  if (edge) { const g = ctx.createRadialGradient(W - 8 * u, 24 * u, 2, W - 8 * u, 24 * u, 90 * u); g.addColorStop(0, "rgba(233,196,106,.9)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); }
  if (ver === "mythic") { const g = ctx.createRadialGradient(C, C, 20 * u, C, C, 160 * u); g.addColorStop(0, "rgba(233,196,106,.45)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); }
  const ball = (x, y, rad, a = pal[0], b = pal[1]) => { const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); };
  const rock = (x, y, sc) => { ctx.fillStyle = pal[0]; ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, rr = (34 + Math.sin(i * 2.3 + find.fam) * 9) * u * sc; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.fillStyle = pal[1]; ctx.globalAlpha = 0.55; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + (r() - 0.5) * 36 * u * sc, y + (r() - 0.5) * 30 * u * sc, (4 + r() * 6) * u * sc, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; };
  const tail = (len, w0) => { const g = ctx.createLinearGradient(C + 20 * u, C - 20 * u, C - len * u, C + len * u); g.addColorStop(0, pal[0]); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.globalAlpha = 0.9; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(C + 18 * u, C - 10 * u); ctx.lineTo(C - len * u, C + (len - 30) * u); ctx.lineTo(C - (len - 40) * u, C + len * u); ctx.lineTo(C + 10 * u, C + 18 * u); ctx.fill(); ctx.globalAlpha = 1; };
  switch (fam.shape) {
    case "rock": rock(C, C, fam.name === "Moonlet" ? 0.6 : fam.name.includes("Kuiper") ? 1.3 : 1); if (fam.name === "Centaur") { ctx.globalAlpha = 0.35; tail(120); ctx.globalAlpha = 1; } break;
    case "rubble": for (let i = 0; i < 8; i++) rock(C + Math.cos(i * 0.9) * 30 * u, C + Math.sin(i * 1.7) * 24 * u, 0.38); break;
    case "twin": rock(C - 30 * u, C, 0.8); rock(C + 30 * u, C + 8 * u, 0.7); break;
    case "dust": for (let i = 0; i < 260; i++) { const a = r() * 7, d = Math.sqrt(r()) * 90 * u; ctx.fillStyle = pal[0]; ctx.globalAlpha = 0.25 + r() * 0.5; ctx.fillRect(C + Math.cos(a) * d * 1.4, C + Math.sin(a) * d * 0.6, 2 * u, 2 * u); } ctx.globalAlpha = 1; break;
    case "comet": tail(fam.name === "Sungrazer" ? 170 : fam.name === "Interstellar comet" ? 110 : 140); if (fam.name === "Fragmenting comet") { ball(C + 26 * u, C - 18 * u, 7 * u, "#ECE7DC", pal[1]); ball(C - 4 * u, C + 12 * u, 6 * u, "#ECE7DC", pal[1]); } ball(C + 14 * u, C - 4 * u, 14 * u, "#FFFFFF", pal[0]); break;
    case "dwarf": ball(C, C, 44 * u); if (fam.name.includes("moon")) ball(C + 70 * u, C - 40 * u, 12 * u); break;
    case "planet": ball(C, C, 60 * u); ctx.globalAlpha = 0.25; ctx.fillStyle = pal[1]; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(C + (r() - 0.5) * 60 * u, C + (r() - 0.5) * 60 * u, (10 + r() * 20) * u, (6 + r() * 10) * u, r() * 3, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; break;
    case "banded": ball(C, C, 62 * u); ctx.save(); ctx.beginPath(); ctx.arc(C, C, 62 * u, 0, 7); ctx.clip(); ctx.fillStyle = pal[1]; ctx.globalAlpha = 0.45; for (let k = -3; k <= 3; k++) ctx.fillRect(C - 70 * u, C + k * 16 * u, 140 * u, 6 * u); ctx.restore(); ctx.globalAlpha = 1; break;
    case "ringed": ctx.strokeStyle = pal[0]; ctx.globalAlpha = 0.8; ctx.lineWidth = 6 * u; ctx.beginPath(); ctx.ellipse(C, C, 110 * u, 30 * u, -0.35, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; ball(C, C, 56 * u); ctx.strokeStyle = pal[0]; ctx.beginPath(); ctx.ellipse(C, C, 110 * u, 30 * u, -0.35, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke(); break;
    case "lava": ball(C, C, 58 * u, pal[0], "#1a0603"); ctx.strokeStyle = "rgba(255,200,80,.75)"; ctx.lineWidth = 2 * u; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(C - 40 * u + i * 15 * u, C - 34 * u); ctx.lineTo(C - 30 * u + i * 14 * u + (r() - 0.5) * 10 * u, C + 36 * u); ctx.stroke(); } break;
    case "rogue": ball(C, C, 56 * u, pal[1], "#000"); ctx.strokeStyle = pal[0]; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.arc(C, C, 57 * u, 2.2, 4.2); ctx.stroke(); ctx.globalAlpha = 1; break;
    case "locked": ball(C, C, 58 * u); ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.beginPath(); ctx.arc(C, C, 58 * u, -Math.PI / 2, Math.PI / 2); ctx.fill(); break;
    case "diamond": ctx.fillStyle = pal[0]; ctx.beginPath(); ctx.moveTo(C, C - 62 * u); ctx.lineTo(C + 54 * u, C - 10 * u); ctx.lineTo(C, C + 62 * u); ctx.lineTo(C - 54 * u, C - 10 * u); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.moveTo(C - 54 * u, C - 10 * u); ctx.lineTo(C + 54 * u, C - 10 * u); ctx.moveTo(C, C - 62 * u); ctx.lineTo(C - 20 * u, C - 10 * u); ctx.lineTo(C, C + 62 * u); ctx.lineTo(C + 20 * u, C - 10 * u); ctx.closePath(); ctx.stroke(); break;
    case "moon": ball(C - 50 * u, C + 40 * u, 70 * u, pal[1], "#000"); ball(C + 30 * u, C - 30 * u, 32 * u); if (fam.name === "Volcanic moon") { ctx.fillStyle = "rgba(255,170,60,.85)"; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(C + 30 * u + (r() - 0.5) * 34 * u, C - 30 * u + (r() - 0.5) * 34 * u, 3 * u, 0, 7); ctx.fill(); } } break;
    case "shower": ctx.strokeStyle = pal[0]; ctx.lineCap = "round"; for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * W * 0.7, l = (30 + r() * 60) * u; ctx.globalAlpha = 0.4 + r() * 0.6; ctx.lineWidth = (1 + r() * 2) * u; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + l); ctx.stroke(); } ctx.globalAlpha = 1; break;
    case "supernova": { const g = ctx.createRadialGradient(C, C, 2, C, C, 150 * u); g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.18, pal[0]); g.addColorStop(0.45, pal[1]); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2 * u; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, L = (90 + (i % 3) * 30) * u; ctx.beginPath(); ctx.moveTo(C + Math.cos(a) * 30 * u, C + Math.sin(a) * 30 * u); ctx.lineTo(C + Math.cos(a) * L, C + Math.sin(a) * L); ctx.stroke(); } break; }
    case "pulsar": { ctx.save(); ctx.translate(C, C); ctx.rotate(-0.5); const g = ctx.createLinearGradient(0, -160 * u, 0, 160 * u); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, pal[0]); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-6 * u, 0); ctx.lineTo(-30 * u, -160 * u); ctx.lineTo(30 * u, -160 * u); ctx.lineTo(6 * u, 0); ctx.lineTo(30 * u, 160 * u); ctx.lineTo(-30 * u, 160 * u); ctx.fill(); if (fam.name === "Magnetar") { ctx.strokeStyle = pal[0]; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5 * u; for (const k of [40, 70]) { ctx.beginPath(); ctx.ellipse(0, 0, k * u, k * 0.45 * u, Math.PI / 2, 0, 7); ctx.stroke(); } } ctx.restore(); ctx.globalAlpha = 1; ball(C, C, 10 * u, "#FFFFFF", pal[0]); break; }
    case "blackhole": { const disc = (x, y, sc) => { const g = ctx.createRadialGradient(x, y, 30 * u * sc, x, y, 130 * u * sc); g.addColorStop(0, pal[0]); g.addColorStop(0.4, pal[1]); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 140 * u * sc, 46 * u * sc, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x, y, 40 * u * sc, 0, 7); ctx.fill(); ctx.strokeStyle = pal[0]; ctx.lineWidth = 2 * u; ctx.stroke(); }; if (fam.name.startsWith("Binary")) { disc(C - 50 * u, C - 20 * u, 0.55); disc(C + 50 * u, C + 20 * u, 0.55); } else disc(C, C, 1); break; }
    case "quasar": { const g = ctx.createRadialGradient(C, C, 4, C, C, 80 * u); g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.3, pal[0]); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); ctx.fillStyle = pal[0]; ctx.globalAlpha = 0.7; ctx.fillRect(C - 3 * u, 0, 6 * u, W); ctx.globalAlpha = 1; break; }
    case "nebula": for (let i = 0; i < 9; i++) { const g = ctx.createRadialGradient(C + (r() - 0.5) * 140 * u, C + (r() - 0.5) * 140 * u, 4, C, C, (60 + r() * 60) * u); g.addColorStop(0, i % 2 ? pal[0] : pal[1]); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.globalAlpha = 0.35; ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); } ctx.globalAlpha = 1; break;
    case "star": { const big = fam.name === "Red giant"; const g = ctx.createRadialGradient(C, C, 4, C, C, (big ? 110 : 70) * u); g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.5, pal[0]); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W); ball(C, C, (big ? 64 : 24) * u, "#FFFFFF", pal[0]); break; }
  }
  // the version's finish
  if (ver === "prismatic") { const g = ctx.createConicGradient ? ctx.createConicGradient(0, C, C) : null; if (g) { ["#F06A5A", "#F2B45A", "#6FD9A8", "#7FA6F5", "#B48CF2", "#F06A5A"].forEach((c, i) => g.addColorStop(i / 5, c)); ctx.strokeStyle = g; ctx.lineWidth = 5 * u; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(C, C, 120 * u, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; } }
  if (ver === "ancient") { ctx.globalCompositeOperation = "color"; ctx.fillStyle = "rgba(170,120,60,.55)"; ctx.fillRect(0, 0, W, W); ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = "rgba(233,196,106,.5)"; ctx.lineWidth = 1 * u; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(C + (r() - 0.5) * 80 * u, C + (r() - 0.5) * 80 * u); ctx.lineTo(C + (r() - 0.5) * 120 * u, C + (r() - 0.5) * 120 * u); ctx.stroke(); } }
  if (ver === "mythic") { ctx.fillStyle = "#FFF4D6"; for (let i = 0; i < 18; i++) { const x = r() * W, y = r() * W, k = (2 + r() * 3) * u; ctx.beginPath(); ctx.moveTo(x, y - k * 2); ctx.lineTo(x + k * 0.5, y); ctx.lineTo(x, y + k * 2); ctx.lineTo(x - k * 0.5, y); ctx.fill(); } ctx.strokeStyle = "#E9C46A"; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(C, C, 126 * u, 0, 7); ctx.stroke(); }
  ctx.restore();
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
const DARK_VARS = { "--sky-gold": "#E9C46A", "--sky-band": "#D9CFC0", "--sky-white": "#ECE7DC", "--sky-glow": "#CFE0FF", "--sky-blue": "#4C7DF0", "--sky-ember": "#E8643F", "--star": "#ECE7DC" };
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
  if (cardSkin.sky === "deep") return;
  const img = await svgPicture(<SkyBackdrop skin={cardSkin.sky} />, "-420 -220 840 440", 1200, 630);
  if (img) ctx.drawImage(img, 0, 0, 1200, 630);
}
// The core with its skin, centred on (cx, cy), body radius ~46 at scale 1.
async function drawCore(ctx, cx, cy, scale = 1) {
  const k = cardSkin.core, body = k === "horizon" ? "#0B0B0B" : "#ECE7DC";
  const inner = (
    <>
      <CoreSkin skin={k} layer="back" />
      <circle r="56" fill="none" stroke="#E8643F" strokeWidth="2" />
      <circle r="46" fill={body} />
      <CoreSkin skin={k} layer="front" />
    </>
  );
  const size = 640 * scale, img = await svgPicture(inner, "-320 -320 640 640", size, size);
  if (img) ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

async function base(ctx, eyebrow) {
  ctx.fillStyle = "#0B0B0B"; ctx.fillRect(0, 0, 1200, 630);
  await drawBackdrop(ctx);
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(236,231,220,${0.1 + r() * 0.4})`; ctx.fillRect(r() * 1200, r() * 630, 2, 2); }
  if (cardFrame) { ctx.strokeStyle = cardFrame === "gold" ? "#E9C46A" : "#C9CED6"; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 1190, 620); ctx.lineWidth = 1.5; ctx.strokeRect(20, 20, 1160, 590); }
  ctx.fillStyle = "#E8643F"; ctx.fillRect(0, 0, 1200, 6); ctx.fillRect(64, 70, 10, 10);
  ctx.fillStyle = "#A39E92"; ctx.font = `400 20px ${font("--font-mono")}`; ctx.fillText(eyebrow.toUpperCase(), 88, 81);
  ctx.textAlign = "right"; ctx.font = `400 18px ${font("--font-mono")}`; ctx.fillText("THE DYNASTY SINGULARITY · THE NIGHT SKY", 1136, 590);
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
  await base(ctx, "My season sky");
  ctx.save(); ctx.translate(880, 300); ctx.scale(0.95, 0.95);
  for (const c of skyFor(state.season)) {
    const f = state.filled[c.id];
    ctx.strokeStyle = STAR[c.color]; ctx.globalAlpha = 0.6; ctx.lineWidth = 2;
    c.edges.forEach(([i, j]) => { ctx.beginPath(); ctx.moveTo(c.pts[i][0], c.pts[i][1]); ctx.lineTo(c.pts[j][0], c.pts[j][1]); ctx.stroke(); });
    ctx.globalAlpha = 1;
    c.pts.forEach(([x, y, r], i) => { ctx.fillStyle = f[i] ? STAR[f[i]] : STAR[c.color]; ctx.globalAlpha = f[i] ? 1 : 0.35; ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  await drawCore(ctx, 880, 300, 0.95);
  const finds = Object.values(state.found).reduce((a, b) => a + b.n, 0);
  ctx.fillStyle = "#ECE7DC"; ctx.font = `800 72px ${font("--font-display")}`; ctx.fillText(title.toUpperCase(), 64, 190);
  const cells = [[seasonProgress(state).points.toLocaleString(), "season points"], [String(finds), "finds"], [`${Object.keys(state.found).length} / ${size.toLocaleString()}`, "catalogue"], [`${state.btm[0]}-${state.btm[1]}`, "vs the model"]];
  cells.forEach(([v, l], i) => { const x = 64 + (i % 2) * 260, y = 300 + Math.floor(i / 2) * 110; ctx.fillStyle = "#ECE7DC"; ctx.font = `800 54px ${font("--font-display")}`; ctx.fillText(v, x, y); ctx.fillStyle = "#A39E92"; ctx.font = `400 18px ${font("--font-mono")}`; ctx.fillText(l.toUpperCase(), x, y + 30); });
  if (rarest) { ctx.fillStyle = "#E9C46A"; ctx.font = `400 20px ${font("--font-mono")}`; ctx.fillText(`RAREST FIND: ${rarest.name.toUpperCase()} (1 IN ${rarest.oneIn.toLocaleString()})`, 64, 520); }
  return cv;
}
export const toBlob = (cv) => new Promise((res) => cv.toBlob(res, "image/png"));
