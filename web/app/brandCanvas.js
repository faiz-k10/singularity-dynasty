"use client";

import { renderToStaticMarkup } from "react-dom/server";
import { MarkSvg } from "@/lib/markSvg";

// The brand lockup on a canvas share picture (founder, Nov 17 2026: "replace all Dynasty Singularity tags in the share exports with the logo
// with the initials and the dynasty singularity stylized in the website landing page hero heading"): the initials logo (DS in the disc, the
// "-ds" brand files) and DYNASTY SINGULARITY in Big Shoulders 600 with the hero bar's .34em tracking (.ehp-brand). Used by the dashboard
// shares (app/snapshot.js) and the Night Sky cards (account/sky/skyArt.js); the HTML export uses .brand-word and the server cards lib/cardArt.js.
const marks = new Map();
function markImage(ink, accent, bg) {
  const key = `${ink}|${accent}|${bg}`;
  if (!marks.has(key)) {
    const svg = renderToStaticMarkup(<MarkSvg size={400} ink={ink} ember={accent} bg={bg} initials />).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    marks.set(key, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }));
  }
  return marks.get(key);
}

const displayFont = () => (typeof window === "undefined" ? "sans-serif" : getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif");

// Draws the lockup with its vertical middle at y. `size` = the logo's height in px (the word is sized to it); align "left" starts at x,
// "right" ends at x. Returns the lockup's width. The letters are spaced one by one (canvas letter-spacing isn't in every browser yet).
export async function drawBrand(ctx, x, y, size, { ink = "#ECE7DC", accent = "#4C7DF0", bg = "#0B0B0B", word = ink, align = "left" } = {}) {
  const img = await markImage(ink, accent, bg);
  const text = "DYNASTY SINGULARITY", fs = Math.round(size * 0.62), track = fs * 0.34, gap = size * 0.34;
  ctx.save();
  ctx.font = `600 ${fs}px ${displayFont()}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const chars = [...text].map((c) => ctx.measureText(c).width);
  const textW = chars.reduce((a, w) => a + w + track, 0) - track;
  const width = size + gap + textW;
  let cx = align === "right" ? x - width : x;
  if (img) ctx.drawImage(img, cx, y - size / 2, size, size);
  cx += size + gap;
  ctx.fillStyle = word;
  [...text].forEach((c, i) => { ctx.fillText(c, cx, y + fs * 0.04); cx += chars[i] + track; });
  ctx.restore();
  return width;
}
