// The Singularity Dynasty mark: the event-horizon disc with one line spiralling in toward it, a football at its outer end (the line is its flight
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

// "SD" in Big Shoulders 800 (the site's display face) as an outline, 1 unit tall (cap height), centred on 0,0 -- scale it with a transform. Made
// from web/assets/og-fonts/BigShoulders-800.ttf with fontTools, so the letters look the same everywhere (inline svg, Satori images) with no font
// loading. Width = 1.2845 x the height.
export const MARK_SD = "M-0.3425 0.5Q-0.4737 0.5 -0.5324 0.446Q-0.591 0.3919 -0.5965 0.2662Q-0.5971 0.2442 -0.5971 0.2198Q-0.5971 0.1954 -0.5958 0.1706Q-0.5946 0.1459 -0.5922 0.1239H-0.4316Q-0.4341 0.1703 -0.4347 0.2146Q-0.4353 0.2589 -0.4316 0.2973Q-0.4292 0.3284 -0.4066 0.3446Q-0.384 0.3608 -0.3425 0.3608Q-0.3034 0.3608 -0.2821 0.3446Q-0.2607 0.3284 -0.257 0.2973Q-0.2546 0.2753 -0.254 0.2534Q-0.2534 0.2314 -0.2543 0.2094Q-0.2552 0.1874 -0.257 0.1661Q-0.2595 0.1368 -0.2784 0.1148Q-0.2973 0.0928 -0.3284 0.0861L-0.4335 0.0617Q-0.4951 0.0476 -0.5311 0.0177Q-0.5672 -0.0122 -0.583 -0.0577Q-0.5989 -0.1032 -0.6007 -0.1642Q-0.6013 -0.1929 -0.6013 -0.2173Q-0.6013 -0.2418 -0.6007 -0.2674Q-0.5971 -0.3504 -0.5699 -0.4017Q-0.5427 -0.453 -0.4872 -0.4765Q-0.4316 -0.5 -0.3425 -0.5Q-0.2125 -0.5 -0.1542 -0.4463Q-0.0958 -0.3926 -0.091 -0.2674Q-0.0897 -0.2393 -0.0907 -0.2002Q-0.0916 -0.1612 -0.0934 -0.1264H-0.2564Q-0.2546 -0.1703 -0.254 -0.2131Q-0.2534 -0.2558 -0.2552 -0.2985Q-0.2564 -0.3291 -0.2787 -0.3452Q-0.301 -0.3614 -0.3431 -0.3614Q-0.3828 -0.3614 -0.4051 -0.3452Q-0.4274 -0.3291 -0.4304 -0.2985Q-0.4341 -0.265 -0.4341 -0.2314Q-0.4341 -0.1978 -0.4304 -0.1642Q-0.428 -0.1355 -0.4139 -0.1145Q-0.3999 -0.0934 -0.3687 -0.0861L-0.2753 -0.0665Q-0.2082 -0.0519 -0.1676 -0.0211Q-0.127 0.0098 -0.1078 0.0565Q-0.0885 0.1032 -0.0861 0.1661Q-0.0855 0.1819 -0.0855 0.199Q-0.0855 0.2161 -0.0861 0.2332Q-0.0867 0.2503 -0.0873 0.2662Q-0.0922 0.3919 -0.1514 0.446Q-0.2106 0.5 -0.3425 0.5ZM0.091 0.4884V-0.4884H0.3388Q0.4701 -0.4884 0.5284 -0.4332Q0.5867 -0.3779 0.5891 -0.2515Q0.591 -0.1618 0.5916 -0.0809Q0.5922 0 0.5916 0.0803Q0.591 0.1606 0.5891 0.2503Q0.5867 0.3773 0.5284 0.4328Q0.4701 0.4884 0.3394 0.4884ZM0.2607 0.3382H0.3394Q0.3791 0.3382 0.399 0.3208Q0.4188 0.3034 0.4194 0.2698Q0.4212 0.2002 0.4222 0.1331Q0.4231 0.0659 0.4231 -0.0006Q0.4231 -0.0672 0.4222 -0.1346Q0.4212 -0.2021 0.4194 -0.2711Q0.4188 -0.304 0.3987 -0.3211Q0.3785 -0.3382 0.3388 -0.3382H0.2607Z";
export const MARK_SD_WIDTH = 1.2845;

// the football IN the disc (founder, Nov 10 2026): the plain logo has a big football cut out of the middle of the disc, tilted like a ball in
// flight, and its laces ARE the letters SD -- the S and D take the place of the stitches and the seam (the short line that joined the stitches) is
// laid over them, all in the disc's colour (picked from mockups/logo-football-sd-as-laces.png, "bigger", with the ball 10% larger).
const CB_L = 16.5, CB_W = 7.0, SD_H = 4.4;
export const MARK_CENTER_BALL = {
  transform: "translate(20 20) rotate(-35)",
  d: `M${-CB_L / 2} 0 C${-CB_L / 4} ${-CB_W} ${CB_L / 4} ${-CB_W} ${CB_L / 2} 0 C${CB_L / 4} ${CB_W} ${-CB_L / 4} ${CB_W} ${-CB_L / 2} 0 Z`,
  sdTransform: `scale(${SD_H})`, // MARK_SD drawn at the laces' size, in the ball's own (tilted) coordinates
  seam: "M-3.9 0 H3.9", // the laces' line, laid over the letters
  seamWidth: 0.65,
};

// the version with just the initials (no football in the disc): SD upright and large in the disc
export const MARK_DISC_SD = { transform: "translate(20 20.2) scale(9.6)" };
