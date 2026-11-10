// The Dynasty Singularity mark: the event-horizon disc with one line spiralling in toward it, a football at its outer end (the line is its flight
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

// "DS" in Big Shoulders 800 (the site's display face) as an outline, 1 unit tall (cap height), centred on 0,0 -- scale it with a transform. Made
// from web/assets/og-fonts/BigShoulders-800.ttf with fontTools, so the letters look the same everywhere (inline svg, Satori images) with no font
// loading. Width = 1.1325 x the height.
export const MARK_DS = "M-0.5662 0.4884V-0.4884H-0.3184Q-0.1871 -0.4884 -0.1288 -0.4332Q-0.0705 -0.3779 -0.0681 -0.2515Q-0.0662 -0.1618 -0.0656 -0.0809Q-0.065 0 -0.0656 0.0803Q-0.0662 0.1606 -0.0681 0.2503Q-0.0705 0.3773 -0.1288 0.4328Q-0.1871 0.4884 -0.3178 0.4884ZM-0.3965 0.3382H-0.3178Q-0.2781 0.3382 -0.2582 0.3208Q-0.2384 0.3034 -0.2378 0.2698Q-0.236 0.2002 -0.235 0.1331Q-0.2341 0.0659 -0.2341 -0.0006Q-0.2341 -0.0672 -0.235 -0.1346Q-0.236 -0.2021 -0.2378 -0.2711Q-0.2384 -0.304 -0.2585 -0.3211Q-0.2787 -0.3382 -0.3184 -0.3382H-0.3965ZM0.3092 0.5Q0.178 0.5 0.1194 0.446Q0.0607 0.3919 0.0553 0.2662Q0.0546 0.2442 0.0546 0.2198Q0.0546 0.1954 0.0559 0.1706Q0.0571 0.1459 0.0595 0.1239H0.2201Q0.2176 0.1703 0.217 0.2146Q0.2164 0.2589 0.2201 0.2973Q0.2225 0.3284 0.2451 0.3446Q0.2677 0.3608 0.3092 0.3608Q0.3483 0.3608 0.3697 0.3446Q0.391 0.3284 0.3947 0.2973Q0.3971 0.2753 0.3977 0.2534Q0.3984 0.2314 0.3974 0.2094Q0.3965 0.1874 0.3947 0.1661Q0.3922 0.1368 0.3733 0.1148Q0.3544 0.0928 0.3233 0.0861L0.2183 0.0617Q0.1566 0.0476 0.1206 0.0177Q0.0846 -0.0122 0.0687 -0.0577Q0.0528 -0.1032 0.051 -0.1642Q0.0504 -0.1929 0.0504 -0.2173Q0.0504 -0.2418 0.051 -0.2674Q0.0546 -0.3504 0.0818 -0.4017Q0.109 -0.453 0.1645 -0.4765Q0.2201 -0.5 0.3092 -0.5Q0.4393 -0.5 0.4976 -0.4463Q0.5559 -0.3926 0.5607 -0.2674Q0.562 -0.2393 0.5611 -0.2002Q0.5601 -0.1612 0.5583 -0.1264H0.3953Q0.3971 -0.1703 0.3977 -0.2131Q0.3984 -0.2558 0.3965 -0.2985Q0.3953 -0.3291 0.373 -0.3452Q0.3507 -0.3614 0.3086 -0.3614Q0.2689 -0.3614 0.2466 -0.3452Q0.2244 -0.3291 0.2213 -0.2985Q0.2176 -0.265 0.2176 -0.2314Q0.2176 -0.1978 0.2213 -0.1642Q0.2237 -0.1355 0.2378 -0.1145Q0.2518 -0.0934 0.283 -0.0861L0.3764 -0.0665Q0.4435 -0.0519 0.4841 -0.0211Q0.5247 0.0098 0.544 0.0565Q0.5632 0.1032 0.5656 0.1661Q0.5662 0.1819 0.5662 0.199Q0.5662 0.2161 0.5656 0.2332Q0.565 0.2503 0.5644 0.2662Q0.5595 0.3919 0.5003 0.446Q0.4411 0.5 0.3092 0.5Z";
export const MARK_DS_WIDTH = 1.1325;

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
