// Where the member's rarest find sits in their sky (founder, Nov 17 2026: "include the rarest find in the actual sky ... position them
// differently for different types of objects based on actual astronomical positioning"). The core is this sky's sun, so:
//   rocks, rubble piles, contact binaries, dust   -> the asteroid belt, a middle orbit
//   planets and moons                             -> an inner orbit, close to the sun
//   comets                                        -> swinging in on a long orbit, the tail always pointing AWAY from the sun (solar wind)
//   dwarf worlds                                  -> beyond the belt, out where Pluto and the Kuiper belt are
//   rogue planets                                 -> loose in the outer dark, bound to nothing
//   meteor showers                                -> a radiant high in the sky
//   stellar events (supernova, pulsar, black hole, quasar, nebula, giant stars) -> deep sky, the far field
// Within its zone the object takes the spot farthest from the constellations (stars AND lines) and the sky's words, so it never covers
// anything. Pure: coordinates are the sky's own (core at 0,0).
import { FAMILIES } from "./nightSky.js";

const ZONES = {
  planet: { r: 128, size: 46, orbit: true }, banded: { r: 128, size: 50, orbit: true }, ringed: { r: 132, size: 62, orbit: true },
  lava: { r: 118, size: 46, orbit: true }, locked: { r: 118, size: 44, orbit: true }, diamond: { r: 128, size: 40, orbit: true },
  moon: { r: 132, size: 50, orbit: true },
  rock: { r: 172, size: 30, orbit: "belt" }, rubble: { r: 172, size: 32, orbit: "belt" }, twin: { r: 172, size: 34, orbit: "belt" }, dust: { r: 172, size: 40, orbit: "belt" },
  comet: { r: 180, size: 70, comet: true },
  dwarf: { r: 220, size: 34, orbit: true },
  rogue: { r: 250, size: 40, far: true },
  shower: { r: 230, size: 84, far: true, prefer: -90 },
  supernova: { r: 262, size: 78, far: true }, pulsar: { r: 262, size: 70, far: true }, blackhole: { r: 266, size: 80, far: true },
  quasar: { r: 272, size: 64, far: true }, nebula: { r: 262, size: 90, far: true }, star: { r: 258, size: 66, far: true },
};
export const zoneOf = (fam) => ZONES[FAMILIES[fam]?.shape] || ZONES.rock;

const segDist = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const boxDist = (px, py, [x0, y0, x1, y1]) => Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1));

// sky: the season's constellations; w / h: the frame (the page is 960 x 600, the card's sky 600 x 600); avoid: boxes [x0, y0, x1, y1]
// for words; stretch: how far the outer zones widen sideways on a landscape frame.
export function placeFind(fam, sky, { w = 600, h = 600, avoid = [], stretch = 1 } = {}) {
  const z = zoneOf(fam), half = z.size / 2, pts = sky.flatMap((c) => c.pts.map(([x, y]) => [x, y]));
  const segs = sky.flatMap((c) => c.edges.map(([i, j]) => [c.pts[i], c.pts[j]]));
  let best = null;
  for (let deg = 0; deg < 360; deg += 4) {
    const a = (deg * Math.PI) / 180, sx = z.far || z.comet ? stretch : 1; // orbits stay circles
    const x = Math.cos(a) * z.r * sx, y = Math.sin(a) * z.r;
    if (Math.abs(x) > w / 2 - half - 12 || Math.abs(y) > h / 2 - half - 12) continue;
    let clear = Infinity;
    for (const [px, py] of pts) clear = Math.min(clear, Math.hypot(x - px, y - py) - 10);
    for (const [p, q] of segs) clear = Math.min(clear, segDist(x, y, p, q) - 4);
    for (const b of avoid) clear = Math.min(clear, boxDist(x, y, b));
    clear -= half;
    // a small pull toward the zone's preferred direction (a shower's radiant is overhead), never enough to cover anything
    const pull = z.prefer != null ? -Math.abs(((deg - z.prefer + 540) % 360) - 180) / 18 : 0;
    const score = Math.min(clear, 60) + pull;
    if (!best || score > best.score) best = { x, y, score, a };
  }
  if (!best) best = { x: 0, y: -z.r, a: -Math.PI / 2 };
  // a comet's picture has its tail toward the lower left (135 degrees); turn it so the tail points straight away from the core
  const rot = z.comet ? (best.a * 180) / Math.PI - 135 : 0;
  return { x: Math.round(best.x * 10) / 10, y: Math.round(best.y * 10) / 10, size: z.size, rot, orbit: z.orbit ? z.r : null, belt: z.orbit === "belt" };
}
