// Renders the profile-picture logos into brand/ AND web/public/brand/ (the downloads on /brand) from the SAME mark as the site (lib/brandMark.js): light = ink disc + ember, dark = bone disc +
// cobalt, each plain and with "SD" in the disc (Big Shoulders 800). Run from web/: node scripts/make-brand-logos.mjs

import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { MARK_DISC, MARK_SPIRAL, MARK_BALL, MARK_STROKE } from "../lib/brandMark.js";

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
      h("path", { d: MARK_SPIRAL, fill: "none", stroke: v.ring, strokeWidth: MARK_STROKE * bold, strokeLinecap: "round" }),
      h("circle", { cx: MARK_DISC.cx, cy: MARK_DISC.cy, r: MARK_DISC.r, fill: v.disc }),
      // the point at the end is a FOOTBALL (founder, Nov 10 2026): a pointed oval laid along the line, with laces in the background colour
      h("g", { transform: MARK_BALL.transform },
        h("path", { d: MARK_BALL.d, fill: v.ring }),
        h("path", { d: MARK_BALL.laces, stroke: v.bg, strokeWidth: 0.16, strokeLinecap: "round", fill: "none" })));
    const dCx = off + MARK_DISC.cx * u, dCy = off + MARK_DISC.cy * u, dR = MARK_DISC.r * u;
    const letters = sd
      ? h("div", { style: { position: "absolute", left: dCx - dR, top: dCy - dR, width: dR * 2, height: dR * 2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "BS", fontSize: dR * 1.12, letterSpacing: dR * 0.02, color: v.bg, paddingTop: dR * 0.06 } }, "SD")
      : null;
    const img = new ImageResponse(h("div", { style: { width: S, height: S, display: "flex", position: "relative", background: v.bg } }, mark, letters), { width: S, height: S, fonts: [{ name: "BS", data: font, weight: 800, style: "normal" }] });
    const buf = Buffer.from(await img.arrayBuffer());
    const base = `${OUT}/logo-${name}${sd ? "-sd" : ""}`;
    for (const dir of [OUT, "public/brand"]) {
      const b = base.replace(OUT, dir);
      await writeFile(`${b}-1024.png`, buf);
      await sharp(buf).resize(400, 400).png().toFile(`${b}-400.png`);
    }
    console.log(base);
  }
}
