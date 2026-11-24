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

// sizes were raised 35% on Nov 17 2026 (founder: "make it a bit bigger")
const ZONES = {
  planet: { r: 128, size: 62, orbit: true }, banded: { r: 128, size: 68, orbit: true }, ringed: { r: 132, size: 84, orbit: true },
  lava: { r: 118, size: 62, orbit: true }, locked: { r: 118, size: 59, orbit: true }, diamond: { r: 128, size: 54, orbit: true },
  moon: { r: 132, size: 68, orbit: true },
  rock: { r: 172, size: 40, orbit: "belt" }, rubble: { r: 172, size: 43, orbit: "belt" }, twin: { r: 172, size: 46, orbit: "belt" }, dust: { r: 172, size: 54, orbit: "belt" },
  comet: { r: 180, size: 94, comet: true },
  dwarf: { r: 220, size: 46, orbit: true },
  rogue: { r: 250, size: 54, far: true },
  shower: { r: 200, size: 170, far: true, prefer: -90 }, // 1.5x (founder, Nov 23 2026: "too small"); r 200 so it still fits overhead
  supernova: { r: 262, size: 105, far: true }, pulsar: { r: 262, size: 94, far: true }, blackhole: { r: 266, size: 108, far: true },
  quasar: { r: 272, size: 86, far: true }, nebula: { r: 262, size: 122, far: true }, star: { r: 258, size: 89, far: true },
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
  // turn the picture so it faces the core like a real body lit by it: a comet's tail (drawn toward the lower left, 135 degrees) points straight
  // away, and a planet's lit side (drawn toward the upper left, -135 degrees) faces the core
  const deg = (best.a * 180) / Math.PI;
  const rot = z.comet ? deg - 135 : z.orbit === true ? deg + 180 + 135 : 0;
  return { x: Math.round(best.x * 10) / 10, y: Math.round(best.y * 10) / 10, size: z.size, rot, orbit: z.orbit ? z.r : null, belt: z.orbit === "belt" };
}

// The finds the sky shows (founder, Nov 23 2026): the rarest planet or moon, rarest meteor shower and rarest stellar event, placed stellar
// first, then the shower, then the planet, each kept clear of the ones before it (an orbiting one moves, so it can't be avoided). A member
// with none of those three kinds yet gets their single rarest find. Used by the page's sky and the season share card.
const SHOWCASE_TIERS = [5, 4, 3];
export function placeShowcase(found, sky, { avoid = [], ...opts } = {}) {
  const all = Object.values(found || {}).sort((a, b) => b.oneIn - a.oneIn);
  const list = SHOWCASE_TIERS.map((t) => all.find((f) => FAMILIES[f.fam]?.tier === t)).filter(Boolean);
  if (!list.length && all[0]) list.push(all[0]);
  const boxes = [...avoid];
  return list.map((find) => {
    const place = placeFind(find.fam, sky, { ...opts, avoid: boxes });
    if (!place.orbit) { const h = place.size / 2; boxes.push([place.x - h, place.y - h, place.x + h, place.y + h]); }
    return { find, place };
  });
}
