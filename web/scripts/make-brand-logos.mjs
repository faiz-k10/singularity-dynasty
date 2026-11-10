// Renders the profile-picture logos into brand/ from the SAME mark as the site (lib/brandMark.js): light = ink disc + ember, dark = bone disc +
// cobalt, each plain and with "SD" in the disc (Big Shoulders 800). Run from web/: node scripts/make-brand-logos.mjs

import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { MARK_DISC, MARK_STROKE } from "../lib/brandMark.js";

// The spiral for these files: the site's shape (lib/brandMark.js: 1.18 turns from -150 degrees) drawn TIGHTER around the disc (founder, Nov 10
// 2026: "make the spiral tighter"): radius R_OUT -> R_IN instead of the site's 19.2 -> 14, so the two passes sit closer together and closer to the
// disc. Its inner end stops just short of the disc at the TOP of the circle, like the site's (a merge into the disc was tried and dropped, founder).
const R_OUT = 17.0, R_IN = 13.7;
const spiralPoint = (t) => {
  const r = R_OUT - (R_OUT - R_IN) * Math.pow(t, 0.9);
  const th = ((-150 + 1.18 * 360 * t) * Math.PI) / 180;
  return [20 + r * Math.cos(th), 20 + r * Math.sin(th)];
};
const SPIRAL = "M" + Array.from({ length: 121 }, (_, i) => spiralPoint(i / 120).map((n) => n.toFixed(2)).join(" ")).join(" L");
// the football sits just BEHIND the line's outer end, pointing along it, its back tip on the line (the line reads as its flight path)
const BALL_L = 4.4, BALL_W = 1.85; // length; the curve's control height (the ball is about 1.5x that wide)
const [P0, P1] = [spiralPoint(0), spiralPoint(0.01)];
const DL = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]), UX = (P1[0] - P0[0]) / DL, UY = (P1[1] - P0[1]) / DL;
const BALL_ANGLE = (Math.atan2(UY, UX) * 180) / Math.PI;
const BALL_CX = P0[0] - UX * (BALL_L / 2 + 0.15), BALL_CY = P0[1] - UY * (BALL_L / 2 + 0.15);
const font = await readFile("assets/og-fonts/BigShoulders-800.ttf");
const OUT = "../brand";
const S = 1024, BOX = 800; // the mark's 40-unit box drawn 760px wide, centred (platforms crop to a circle)
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
