"use client";

import { SHARE_W, SHARE_H } from "@/lib/labShare";

// Pictures of what is on screen, for sharing: The Observatory's charts (tools/lab/LabExport.js) and the player dashboards (DashboardShareButton.js).
// html-to-image is loaded on demand; the page's fonts are turned into embeddable CSS once per visit (the slow part of the first picture).
export const loadLib = () => import("html-to-image");
let fontCss = null;
export async function fontsFor(el) {
  if (!fontCss) {
    const { getFontEmbedCSS } = await loadLib();
    fontCss = await getFontEmbedCSS(el);
  }
  return fontCss;
}
export const bodyColor = () => getComputedStyle(document.body).backgroundColor;

// The element exactly as it is on screen (its real styles, at twice the screen's pixels, on the page's background), leaving out anything that
// matches `skip` (the Share button itself). Drawing blocks the page for a moment, so it first lets the page paint.
// Images from another site (player photos on Sleeper's server) can't be copied into a picture, so for the moment of the snapshot they are
// shown through our own relay (app/api/img) -- the same picture, so nothing visibly changes -- and put back afterwards.
async function sameSiteImages(el) {
  const swapped = [];
  await Promise.all([...el.querySelectorAll("img")].map(async (img) => {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith("data:") || src.startsWith("blob:") || new URL(src, location.href).origin === location.origin) return;
    try {
      const res = await fetch(`/api/img?u=${encodeURIComponent(src)}`);
      if (!res.ok) throw new Error("relay");
      const local = URL.createObjectURL(await res.blob());
      const { srcset } = img;
      img.removeAttribute("srcset"); img.src = local; await img.decode().catch(() => {});
      swapped.push(() => { img.src = src; if (srcset) img.srcset = srcset; URL.revokeObjectURL(local); });
    } catch {
      const keep = img.style.visibility; img.style.visibility = "hidden"; // can't be relayed: left out rather than failing the whole picture
      swapped.push(() => { img.style.visibility = keep; });
    }
  }));
  return () => swapped.forEach((undo) => undo());
}

export async function snapshotPng(el, { skip = ".share-card-btn, [data-noshot]" } = {}) {
  const { toBlob } = await loadLib();
  await new Promise((r) => setTimeout(r, 60));
  const restore = await sameSiteImages(el);
  try {
    const blob = await toBlob(el, {
      pixelRatio: 2,
      backgroundColor: bodyColor(),
      fontEmbedCSS: await fontsFor(el),
      width: el.offsetWidth,
      height: el.offsetHeight,
      style: { margin: "0", position: "static", left: "auto", top: "auto", transform: "none" },
      filter: (node) => !(node instanceof Element && node.matches?.(skip)),
    });
    if (!blob) throw new Error("no image");
    return blob;
  } finally {
    restore();
  }
}

const font = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "sans-serif";
const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

// The picture on a 1.91 : 1 card (the shape every platform uses for a large link preview, so none of them crops it), in the page's own
// colours. With `head` = { left, right }: a branded strip across the top (the ember mark, DYNASTY SINGULARITY, and what the picture is),
// a hairline under it, and the picture fitted in the rest. Without it (The Observatory's pictures carry their own heading): the picture alone.
// `blocks` (from blockRects): for a tall, narrow dashboard (the Dynasty Board's profile is ~10x taller than wide and would be a sliver on a
// wide card), the picture is cut at those sections and laid out in side-by-side columns, in reading order, with the column count chosen to
// show it largest.
export function blockRects(el, selector) {
  const box = el.getBoundingClientRect();
  return [...el.querySelectorAll(selector)].filter((b) => b.offsetHeight > 0).map((b) => { const r = b.getBoundingClientRect(); return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }; });
}
function columnsFor(blocks, gap, boxW, boxH) {
  const W0 = Math.max(...blocks.map((b) => b.w)), total = blocks.reduce((a, b) => a + b.h, 0) + gap * (blocks.length - 1);
  let best = null;
  for (let k = 1; k <= Math.min(6, blocks.length); k++) {
    const cols = [[]], target = total / k;
    let h = 0;
    for (const b of blocks) { if (h > 0 && h + b.h / 2 > target && cols.length < k) { cols.push([]); h = 0; } cols[cols.length - 1].push(b); h += b.h + gap; }
    const tall = Math.max(...cols.map((c) => c.reduce((a, b) => a + b.h, 0) + gap * (c.length - 1)));
    const s = Math.min(boxW / (cols.length * W0 + (cols.length - 1) * gap), boxH / tall);
    if (!best || s > best.s) best = { s, cols, W0 };
  }
  return best;
}

export async function toShareCard(blob, head = null, blocks = null) {
  const img = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bodyColor();
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  let top = 40;
  if (head) {
    const ink = cssVar("--star", "#ECE7DC"), dim = cssVar("--star-dim", "#A39E92"), ember = cssVar("--ember", "#E8643F"), line = cssVar("--line", "#27251F");
    ctx.fillStyle = ember; ctx.fillRect(0, 0, SHARE_W, 8); ctx.fillRect(64, 62, 22, 22);
    ctx.textBaseline = "middle";
    ctx.fillStyle = ink; ctx.font = `700 34px ${font("--font-mono")}`; ctx.fillText("DYNASTY SINGULARITY", 104, 74);
    if (head.right) { ctx.textAlign = "right"; ctx.fillStyle = dim; ctx.font = `400 30px ${font("--font-mono")}`; ctx.fillText(String(head.right).toUpperCase(), SHARE_W - 64, 74); ctx.textAlign = "left"; }
    ctx.fillStyle = line; ctx.fillRect(64, 128, SHARE_W - 128, 2);
    top = 156;
  }
  const pad = 48, boxW = SHARE_W - 2 * pad, boxH = SHARE_H - top - pad;
  if (blocks?.length > 1) {
    const k = img.width / blocks.reduce((a, b) => Math.max(a, b.x + b.w), 0); // picture pixels per CSS pixel
    const px = blocks.map((b) => ({ x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k }));
    const gap = 24 * k, lay = columnsFor(px, gap, boxW, boxH);
    const colW = lay.W0 * lay.s, used = lay.cols.length * colW + (lay.cols.length - 1) * gap * lay.s;
    lay.cols.forEach((col, ci) => {
      let y = top + (boxH - Math.max(...lay.cols.map((c) => c.reduce((a, b) => a + b.h, 0) + gap * (c.length - 1))) * lay.s) / 2;
      const x0 = (SHARE_W - used) / 2 + ci * (colW + gap * lay.s);
      for (const b of col) { ctx.drawImage(img, b.x, b.y, b.w, b.h, x0, y, b.w * lay.s, b.h * lay.s); y += (b.h + gap) * lay.s; }
    });
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no card"))), "image/png"));
  }
  const s = Math.min(boxW / img.width, boxH / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, (SHARE_W - w) / 2, top + (boxH - h) / 2, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no card"))), "image/png"));
}

// Uploads a share picture (app/api/lab-share -> /s/<id>) and returns its link.
export async function uploadShare(card, { title, caption, view }) {
  const form = new FormData();
  form.append("image", card, "share.png");
  form.append("title", title);
  form.append("caption", caption || "");
  form.append("view", view);
  const res = await fetch("/api/lab-share", { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(body.error || "Couldn't create the share link.");
  return body.url;
}
