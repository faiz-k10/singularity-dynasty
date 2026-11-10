// Renders the profile-picture logos into brand/ from the SAME mark as the site (lib/brandMark.js): light = ink disc + ember, dark = bone disc +
// cobalt, each plain and with "SD" in the disc (Big Shoulders 800). Run from web/: node scripts/make-brand-logos.mjs

import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { MARK_DISC, MARK_SPECK, MARK_STROKE } from "../lib/brandMark.js";

// the ball sits where the spiral starts, pointing along it (the line's first step heads up and to the right)
const BALL_L = 4.4, BALL_W = 1.85; // length; the curve's control height (the ball is about 1.5x that wide)
const DIR = [4.29 - 3.37, 9.12 - 10.4], DL = Math.hypot(...DIR), UX = DIR[0] / DL, UY = DIR[1] / DL;
const BALL_ANGLE = (Math.atan2(UY, UX) * 180) / Math.PI;
// the ball sits just BEHIND the line's end, its back tip on the line, so the line reads as its flight path rather than a stem
const BALL_CX = MARK_SPECK.cx - UX * (BALL_L / 2 + 0.15), BALL_CY = MARK_SPECK.cy - UY * (BALL_L / 2 + 0.15);
// The spiral for these files: the site's spiral (lib/brandMark.js: radius 19.2 -> 14 over 1.18 turns from -150 degrees) with its INNER end bent
// down into the disc (founder, Nov 10 2026: "make the other end merging into the circle"): over the last quarter it eases from the site's path to
// radius 11, under the disc's edge, and the disc is drawn on top, so the line flows into the circle instead of stopping short of it.
const SPIRAL = (() => {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const q = Math.min(1, Math.max(0, (t - 0.72) / 0.28)), ease = q * q * (3 - 2 * q);
    const r = 19.2 - 5.2 * Math.pow(t, 0.9) - 3.0 * ease;
    const th = ((-150 + 1.18 * 360 * t) * Math.PI) / 180;
    pts.push(`${(20 + r * Math.cos(th)).toFixed(2)} ${(20 + r * Math.sin(th)).toFixed(2)}`);
  }
  return "M" + pts.join(" L");
})();
const font = await readFile("assets/og-fonts/BigShoulders-800.ttf");
const OUT = "../brand";
const S = 1024, BOX = 760; // the mark's 40-unit box drawn 760px wide, centred (platforms crop to a circle)
const u = BOX / 40, off = (S - BOX) / 2;
const variants = {
  light: { bg: "#ECE7DC", disc: "#0B0B0B", ring: "#C8401E" }, // the site's light mode: bone paper, ink disc, ember
  dark: { bg: "#0B0B0B", disc: "#ECE7DC", ring: "#4C7DF0" }, // the site's dark mode: void, bone disc, cobalt (the site's second accent)
};
for (const [name, v] of Object.entries(variants)) {
  for (const sd of [false, true]) {
    const bold = 0.6; // much thinner than the header's 1.5-unit line: at avatar size the site's own weight reads heavy (founder, Nov 10 2026: "lines are too thick")
    const mark = h("svg", { width: BOX, height: BOX, viewBox: "0 0 40 40", style: { position: "absolute", left: off, top: off } },
      h("path", { d: SPIRAL, fill: "none", stroke: v.ring, strokeWidth: MARK_STROKE * bold, strokeLinecap: "round" }),
      h("circle", { cx: MARK_DISC.cx, cy: MARK_DISC.cy, r: MARK_DISC.r, fill: v.disc }),
      // the point at the end is a FOOTBALL (founder, Nov 10 2026): a pointed oval laid along the line, with laces in the background colour
      h("g", { transform: `translate(${BALL_CX} ${BALL_CY}) rotate(${BALL_ANGLE})` },
        h("path", { d: `M${-BALL_L / 2} 0 C${-BALL_L / 4} ${-BALL_W} ${BALL_L / 4} ${-BALL_W} ${BALL_L / 2} 0 C${BALL_L / 4} ${BALL_W} ${-BALL_L / 4} ${BALL_W} ${-BALL_L / 2} 0 Z`, fill: v.ring }),
        h("path", { d: `M-0.75 0 H0.75 M-0.45 -0.32 V0.32 M0 -0.32 V0.32 M0.45 -0.32 V0.32`, stroke: v.bg, strokeWidth: 0.16, strokeLinecap: "round", fill: "none" })));
    const dCx = off + MARK_DISC.cx * u, dCy = off + MARK_DISC.cy * u, dR = MARK_DISC.r * u;
    const letters = sd
      ? h("div", { style: { position: "absolute", left: dCx - dR, top: dCy - dR, width: dR * 2, height: dR * 2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "BS", fontSize: dR * 1.12, letterSpacing: dR * 0.02, color: v.bg, paddingTop: dR * 0.06 } }, "SD")
      : null;
    const img = new ImageResponse(h("div", { style: { width: S, height: S, display: "flex", position: "relative", background: v.bg } }, mark, letters), { width: S, height: S, fonts: [{ name: "BS", data: font, weight: 800, style: "normal" }] });
    const buf = Buffer.from(await img.arrayBuffer());
    const base = `${OUT}/logo-${name}${sd ? "-sd" : ""}`;
    await writeFile(`${base}-1024.png`, buf);
    await sharp(buf).resize(400, 400).png().toFile(`${base}-400.png`);
    console.log(base);
  }
}
