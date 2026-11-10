// The Dynasty Singularity mark: the event-horizon disc with one line spiralling in toward it, a football at its outer end (the line is its flight
// path) -- everything collapsing to one point. A 40-unit box. Redrawn Nov 10 2026 with the founder (tighter spiral, a football instead of a dot,
// the line ending just above the disc at the top). ONE source for every copy of the mark: the header / landing / Observatory marks are inline svg
// (app/BrandMark.js -- not CSS masks, which render blurry), the favicon / apple
// icon / share images draw them through lib/markSvg.js, and the profile-picture files in brand/ come from scripts/make-brand-logos.mjs.
export const MARK_DISC = { cx: 20, cy: 20, r: 15.2 };
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

// "DS" in Big Shoulders 800 (the site's display face) as an outline, 1 unit tall (cap height), centred on 0,0 -- scale it with a transform. Made
// from web/assets/og-fonts/BigShoulders-800.ttf with fontTools, so the letters look the same everywhere (inline svg, Satori images) with no font
// loading. Width = 1.2726 x the height.
export const MARK_DS = "M-0.6363 0.4884V-0.4884H-0.3884Q-0.2572 -0.4884 -0.1989 -0.4332Q-0.1406 -0.3779 -0.1381 -0.2515Q-0.1363 -0.1618 -0.1357 -0.0809Q-0.1351 0 -0.1357 0.0803Q-0.1363 0.1606 -0.1381 0.2503Q-0.1406 0.3773 -0.1989 0.4328Q-0.2572 0.4884 -0.3878 0.4884ZM-0.4666 0.3382H-0.3878Q-0.3481 0.3382 -0.3283 0.3208Q-0.3085 0.3034 -0.3078 0.2698Q-0.306 0.2002 -0.3051 0.1331Q-0.3042 0.0659 -0.3042 -0.0006Q-0.3042 -0.0672 -0.3051 -0.1346Q-0.306 -0.2021 -0.3078 -0.2711Q-0.3085 -0.304 -0.3286 -0.3211Q-0.3487 -0.3382 -0.3884 -0.3382H-0.4666ZM0.3793 0.5Q0.248 0.5 0.1894 0.446Q0.1308 0.3919 0.1253 0.2662Q0.1247 0.2442 0.1247 0.2198Q0.1247 0.1954 0.1259 0.1706Q0.1271 0.1459 0.1296 0.1239H0.2901Q0.2877 0.1703 0.2871 0.2146Q0.2865 0.2589 0.2901 0.2973Q0.2926 0.3284 0.3152 0.3446Q0.3378 0.3608 0.3793 0.3608Q0.4183 0.3608 0.4397 0.3446Q0.4611 0.3284 0.4647 0.2973Q0.4672 0.2753 0.4678 0.2534Q0.4684 0.2314 0.4675 0.2094Q0.4666 0.1874 0.4647 0.1661Q0.4623 0.1368 0.4434 0.1148Q0.4245 0.0928 0.3933 0.0861L0.2883 0.0617Q0.2266 0.0476 0.1906 0.0177Q0.1546 -0.0122 0.1387 -0.0577Q0.1229 -0.1032 0.121 -0.1642Q0.1204 -0.1929 0.1204 -0.2173Q0.1204 -0.2418 0.121 -0.2674Q0.1247 -0.3504 0.1519 -0.4017Q0.179 -0.453 0.2346 -0.4765Q0.2901 -0.5 0.3793 -0.5Q0.5093 -0.5 0.5676 -0.4463Q0.6259 -0.3926 0.6308 -0.2674Q0.632 -0.2393 0.6311 -0.2002Q0.6302 -0.1612 0.6284 -0.1264H0.4654Q0.4672 -0.1703 0.4678 -0.2131Q0.4684 -0.2558 0.4666 -0.2985Q0.4654 -0.3291 0.4431 -0.3452Q0.4208 -0.3614 0.3787 -0.3614Q0.339 -0.3614 0.3167 -0.3452Q0.2944 -0.3291 0.2914 -0.2985Q0.2877 -0.265 0.2877 -0.2314Q0.2877 -0.1978 0.2914 -0.1642Q0.2938 -0.1355 0.3078 -0.1145Q0.3219 -0.0934 0.353 -0.0861L0.4464 -0.0665Q0.5136 -0.0519 0.5542 -0.0211Q0.5948 0.0098 0.614 0.0565Q0.6332 0.1032 0.6357 0.1661Q0.6363 0.1819 0.6363 0.199Q0.6363 0.2161 0.6357 0.2332Q0.6351 0.2503 0.6345 0.2662Q0.6296 0.3919 0.5704 0.446Q0.5111 0.5 0.3793 0.5Z";
export const MARK_DS_WIDTH = 1.2726;

// the football IN the disc (founder, Nov 10 2026): the plain logo has a big football cut out of the middle of the disc, tilted like a ball in
// flight, and its laces ARE the letters DS -- the D and S take the place of the stitches and the seam (the short line that joined the stitches) is
// laid over them, all in the disc's colour (picked from mockups/logo-football-sd-as-laces.png, "bigger", with the ball 10% larger).
const CB_L = 16.5, CB_W = 7.0, DS_H = 4.4;
export const MARK_CENTER_BALL = {
  transform: "translate(20 20) rotate(-35)",
  d: `M${-CB_L / 2} 0 C${-CB_L / 4} ${-CB_W} ${CB_L / 4} ${-CB_W} ${CB_L / 2} 0 C${CB_L / 4} ${CB_W} ${-CB_L / 4} ${CB_W} ${-CB_L / 2} 0 Z`,
  dsTransform: `scale(${DS_H})`, // MARK_DS drawn at the laces' size, in the ball's own (tilted) coordinates
  seam: "M-3.9 0 H3.9", // the laces' line, laid over the letters
  seamWidth: 0.65,
};

// the version with just the initials (no football in the disc): DS upright and large in the disc
export const MARK_DISC_DS = { transform: "translate(20 20.2) scale(9.6)" };
