// The Singularity Dynasty mark: the event-horizon disc with one line spiralling in toward it, a football at its outer end (the line is its flight
// path) -- everything collapsing to one point. A 40-unit box. Redrawn Nov 10 2026 with the founder (tighter spiral, a football instead of a dot,
// the line ending just above the disc at the top). ONE source for every copy of the mark: the header / landing / Observatory marks are inline svg
// (app/BrandMark.js -- not CSS masks, which render blurry), the favicon / apple
// icon / share images draw them through lib/markSvg.js, and the profile-picture files in brand/ come from scripts/make-brand-logos.mjs.
export const MARK_DISC = { cx: 20, cy: 20, r: 12.5 };
export const MARK_STROKE = 1.5; // the line's width in the header; the brand files draw it thinner

// from -142.2 degrees round to 270 (the top of the circle, just above the disc's edge), radius 17 -> 13.7. The start angle puts the football's
// CENTRE exactly at 10 o'clock (founder, Nov 10 2026, picked from mockups/logo-football-10.png).
const R_OUT = 17.0, R_IN = 13.7, START = -142.2, END = 270;
const spiralPoint = (t) => {
  const r = R_OUT - (R_OUT - R_IN) * Math.pow(t, 0.9);
  const th = ((START + (END - START) * t) * Math.PI) / 180;
  return [20 + r * Math.cos(th), 20 + r * Math.sin(th)];
};
export const MARK_SPIRAL = "M" + Array.from({ length: 121 }, (_, i) => spiralPoint(i / 120).map((n) => n.toFixed(2)).join(" ")).join(" L");

// the football: just behind the line's outer end, pointing along it, its back tip on the line
const BALL_L = 4.4, BALL_W = 1.85; // length; the curve's control height (the ball is about 1.5x that wide)
const [P0, P1] = [spiralPoint(0), spiralPoint(0.01)];
const DL = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]), UX = (P1[0] - P0[0]) / DL, UY = (P1[1] - P0[1]) / DL;
export const MARK_BALL = {
  transform: `translate(${(P0[0] - UX * (BALL_L / 2 + 0.15)).toFixed(2)} ${(P0[1] - UY * (BALL_L / 2 + 0.15)).toFixed(2)}) rotate(${((Math.atan2(UY, UX) * 180) / Math.PI).toFixed(1)})`,
  d: `M${-BALL_L / 2} 0 C${-BALL_L / 4} ${-BALL_W} ${BALL_L / 4} ${-BALL_W} ${BALL_L / 2} 0 C${BALL_L / 4} ${BALL_W} ${-BALL_L / 4} ${BALL_W} ${-BALL_L / 2} 0 Z`,
  laces: "M-0.75 0 H0.75 M-0.45 -0.32 V0.32 M0 -0.32 V0.32 M0.45 -0.32 V0.32", // stroked 0.16 in the background colour (or cut out)
};

// the football IN the disc (founder, Nov 10 2026: "for the uninitialed one put a football in the middle as well"): the plain logo (no SD) has a big
// football cut out of the middle of the disc, tilted like a ball in flight, its laces in the disc's colour. The SD versions keep the letters instead.
const CB_L = 15, CB_W = 6.4;
export const MARK_CENTER_BALL = {
  transform: "translate(20 20) rotate(-35)",
  d: `M${-CB_L / 2} 0 C${-CB_L / 4} ${-CB_W} ${CB_L / 4} ${-CB_W} ${CB_L / 2} 0 C${CB_L / 4} ${CB_W} ${-CB_L / 4} ${CB_W} ${-CB_L / 2} 0 Z`,
  laces: "M-2.6 0 H2.6 M-1.6 -1.05 V1.05 M-0.53 -1.05 V1.05 M0.53 -1.05 V1.05 M1.6 -1.05 V1.05",
  lacesWidth: 0.55,
};
