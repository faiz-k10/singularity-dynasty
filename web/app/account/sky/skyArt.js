"use client";

import { renderToStaticMarkup } from "react-dom/server";
import { FAMILIES, COLOURS, skyFor, seasonProgress, COLORS as STAR } from "@/lib/nightSky";
import { SkyBackdrop, CoreSkin } from "./skins";
import { placeShowcase } from "@/lib/skyPlacement";
import { drawBrand } from "../../brandCanvas";
import { StarField, Galaxies, Scrim, LitStar, GlowLine, Bloom, StarSurface } from "./hubble";

// The Night Sky's pictures: the object renderer lives in ./objectArt.js (rebuilt Nov 22 2026, per-pixel and crisp); here are the telescope
// reveal (the picture sharpens out of noise), the object placed in a member's sky, and the share cards.
import { drawObject } from "./objectArt";
export { drawObject };

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
let cardFrame = null; // "star" | "cobalt": the season frame the member has earned (older saves said "silver" / "gold")
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

// The ladder's share-card frames (founder, Nov 19 2026: "more on theme ... than just boring silver"), built from the logo's pieces: a hairline
// border, a four-pointed star at each corner and a faint orbit arc sweeping across the card. "star" (500 points) is ember; "cobalt" (9,000)
// is a cobalt line with a silver inner line and silver stars.
function fourStar(ctx, x, y, r, fill, glow) {
  if (glow) { const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2); g.addColorStop(0, glow); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill(); }
  const w = r * 0.22;
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + w, y - w, x + r, y); ctx.quadraticCurveTo(x + w, y + w, x, y + r);
  ctx.quadraticCurveTo(x - w, y + w, x - r, y); ctx.quadraticCurveTo(x - w, y - w, x, y - r); ctx.fill();
}
function drawFrame(ctx, frame) {
  const f = frame === "gold" ? "cobalt" : frame === "silver" ? "star" : frame;
  if (f !== "star" && f !== "cobalt") { ctx.fillStyle = "#E8643F"; ctx.fillRect(0, 0, 1200, 6); return; }
  const cobalt = f === "cobalt", line = cobalt ? "#4C7DF0" : "#E8643F", star = cobalt ? "#DDE3EC" : "#FFD9C9";
  const glow = cobalt ? "rgba(76,125,240,.55)" : "rgba(232,100,63,.5)";
  ctx.save();
  // the orbit: a faint ellipse round the card's centre, clipped to the card
  ctx.strokeStyle = cobalt ? "rgba(201,206,214,.22)" : "rgba(232,100,63,.22)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(600, 315, 640, 250, -0.18, 0, Math.PI * 2); ctx.stroke();
  // the border: one line inset 16 (the cobalt frame adds a silver inner line)
  ctx.strokeStyle = line; ctx.lineWidth = cobalt ? 3 : 2; ctx.strokeRect(16, 16, 1168, 598);
  if (cobalt) { ctx.strokeStyle = "rgba(201,206,214,.7)"; ctx.lineWidth = 1; ctx.strokeRect(26, 26, 1148, 578); }
  for (const [x, y] of [[16, 16], [1184, 16], [16, 614], [1184, 614]]) {
    ctx.fillStyle = "#0B0B0B"; ctx.fillRect(x - 15, y - 15, 30, 30); // the corner gap the star sits in
    fourStar(ctx, x, y, 14, star, glow);
  }
  ctx.restore();
}

// `corners: false` leaves out the top-right badge and the bottom-right signature (the season card sets them in its own text column);
// `shadeTo` is where the left-hand darkening behind the words fades out.
async function base(ctx, eyebrow, { corners = true, shadeTo = 760 } = {}) {
  ctx.fillStyle = "#0B0B0B"; ctx.fillRect(0, 0, 1200, 630);
  await drawBackdrop(ctx);
  const shade = ctx.createLinearGradient(0, 0, shadeTo, 0); shade.addColorStop(0, "rgba(0,0,0,.62)"); shade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 1200, 630); // keeps the words readable over the nebula
  if (cardFrame) drawFrame(ctx, cardFrame); // a framed card drops the plain ember bar along the top
  else { ctx.fillStyle = "#E8643F"; ctx.fillRect(0, 0, 1200, 6); }
  ctx.fillStyle = "#E8643F"; ctx.fillRect(64, 70, 10, 10);
  ctx.fillStyle = "#A39E92"; ctx.font = `400 20px ${font("--font-mono")}`; ctx.fillText(eyebrow.toUpperCase(), 88, 81);
  if (!corners) return;
  // signature: the brand lockup (app/brandCanvas.js), then "· THE NIGHT SKY"
  ctx.textAlign = "right"; ctx.font = `400 18px ${font("--font-mono")}`; ctx.fillText("· THE NIGHT SKY", 1136, 590);
  const tail = ctx.measureText("· THE NIGHT SKY").width; ctx.textAlign = "left";
  await drawBrand(ctx, 1136 - tail - 12, 584, 30, { ink: "#ECE7DC", accent: "#4C7DF0", bg: "#0B0B0B", word: "#A39E92", align: "right" });
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
  ctx.fillStyle = "#A39E92"; ctx.font = `400 22px ${font("--font-mono")}`; ctx.fillText(`${have.toLocaleString()} of ${size.toLocaleString()} in my catalog`, 64, 478);
  if (compliment) { ctx.fillStyle = "#E9C46A"; ctx.font = `italic 700 26px ${font("--font-body")}`; wrap(ctx, `"${compliment}."`, 64, 525, 600, 30); }
  return cv;
}
export async function receiptCard(wk) {
  const cv = canvas(), ctx = cv.getContext("2d");
  await base(ctx, `Beat the Model · week ${wk.week}`);
  ctx.fillStyle = "#ECE7DC"; ctx.font = `800 120px ${font("--font-display")}`; ctx.fillText(`${wk.right} OF ${wk.made}`, 64, 230);
  ctx.fillStyle = "#A39E92"; ctx.font = `400 24px ${font("--font-mono")}`; ctx.fillText(wk.right * 2 > wk.made ? "I BEAT THE MODEL. YOUR TURN." : "THE MODEL GOT ME THIS WEEK.", 64, 290);
  // a pick with no decision (a player without a game, or a tie) is listed but marked, so "2 of 2" over three picks reads right
  const res = wk.result || [];
  wk.pairs.forEach((p, i) => {
    const c = wk.choice[i]; if (c == null) return;
    const r = res[i], off = r === "nogame" || r === "tie";
    const mark = r === "right" ? "✓" : r === "wrong" ? "✗" : off ? "–" : "";
    ctx.fillStyle = r === "right" ? "#4C7DF0" : r === "wrong" ? "#E8643F" : "#A39E92"; ctx.font = `700 26px ${font("--font-mono")}`; ctx.fillText(mark, 64, 370 + i * 46);
    ctx.fillStyle = off ? "#A39E92" : "#ECE7DC"; ctx.font = `400 26px ${font("--font-mono")}`;
    ctx.fillText(`${p.pos} · ${c === 0 ? p.a : p.b} over ${c === 0 ? p.b : p.a}${r === "nogame" ? " (no game)" : r === "tie" ? " (tie)" : ""}`, mark ? 100 : 64, 370 + i * 46);
  });
  const picked = wk.choice.filter((c) => c != null).length, skipped = picked - wk.made;
  if (skipped > 0) {
    ctx.fillStyle = "#A39E92"; ctx.font = `400 20px ${font("--font-mono")}`;
    ctx.fillText(`${skipped} ${skipped === 1 ? "pick didn't" : "picks didn't"} count: a player didn't play, or they tied.`, 64, 370 + wk.pairs.length * 46 + 10);
  }
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
  // the same finds the page's sky shows (rarest planet / moon, meteor shower, stellar event; placeShowcase), each where its kind belongs,
  // with its orbit drawn faintly when it has one
  for (const { find, place: p } of placeShowcase(state.found, sky, { w: 600, h: 600 })) {
    if (p.orbit) { ctx.save(); ctx.strokeStyle = "rgba(236,231,220,.16)"; ctx.lineWidth = p.belt ? 6 : 1; ctx.setLineDash(p.belt ? [1, 5] : [3, 5]); ctx.beginPath(); ctx.arc(SX, SY, p.orbit, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    const art = p.size * 1.45, img = skyObject(find, Math.round(art * 2), p.rot);
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
  const bw = await drawBrand(ctx, L, 584, 28, { ink: "#ECE7DC", accent: "#4C7DF0", bg: "#0B0B0B", word: "#A39E92" });
  ctx.fillStyle = "#A39E92"; ctx.font = `400 14px ${mono}`; ctx.textBaseline = "alphabetic"; ctx.fillText("· THE NIGHT SKY", L + bw + 10, 590);
  return cv;
}
export const toBlob = (cv) => new Promise((res) => cv.toBlob(res, "image/png"));
