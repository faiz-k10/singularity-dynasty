"use client";

import { useEffect, useState } from "react";

// Star dots + connecting lines for the Pricing nav dropdown's background
// (see globals.css's .nav-star for the shared dot shape/animation
// properties). A fresh constellation is picked and freshly randomized
// every visit -- this has to be a client component doing its work in
// useEffect (not computed at module scope like the old fixed-seed
// version) specifically so it CAN be different each load: anything
// computed during the render Next.js uses for the initial HTML has to
// come out identical on the server and during client hydration, or
// React throws a hydration mismatch. Rendering nothing until the effect
// fires sidesteps that -- the effect runs immediately on mount, long
// before a visitor could actually hover the closed dropdown open, so
// there's no visible pop-in.

// Rough normalized (0-1) asterism shapes -- not IAU-precise star charts,
// just enough of each constellation's real, recognizable outline to read
// as "the Big Dipper" etc. rather than a generic scatter. `edges` are
// index pairs into `points`, matching how each is traditionally drawn
// (e.g. Crux's cross, not a corner-to-corner loop). points[0] is each
// constellation's brightest star, marked gold; the rest blue, matching
// the site's two accents.
const CONSTELLATIONS = {
  bigDipper: {
    points: [
      [0.82, 0.18], [0.68, 0.15], [0.52, 0.22], [0.38, 0.28],
      [0.32, 0.42], [0.16, 0.38], [0.14, 0.55],
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  orion: {
    points: [
      [0.28, 0.12], [0.72, 0.14], [0.38, 0.5], [0.5, 0.48],
      [0.62, 0.46], [0.32, 0.86], [0.68, 0.84],
    ],
    edges: [[0, 2], [2, 3], [3, 4], [4, 1], [2, 5], [4, 6]],
  },
  cassiopeia: {
    points: [[0.08, 0.55], [0.3, 0.2], [0.5, 0.5], [0.7, 0.15], [0.92, 0.5]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  crux: {
    points: [[0.5, 0.08], [0.5, 0.88], [0.14, 0.42], [0.82, 0.52]],
    edges: [[0, 1], [2, 3]],
  },
  lyra: {
    points: [[0.5, 0.08], [0.28, 0.5], [0.42, 0.72], [0.62, 0.72], [0.72, 0.48]],
    edges: [[0, 1], [0, 4], [1, 2], [2, 3], [3, 4]],
  },
};

const FILLER_COLORS = ["--neon-blue-rgb", "--horizon-gold-rgb", "--star-dot-rgb"];
const FILLER_COUNT = 35;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateLayout() {
  // Real randomness (a fresh seed per page load), not a fixed one -- the
  // whole point this time is a different constellation/layout per visit.
  const rand = mulberry32(Math.floor(Math.random() * 2 ** 31));
  const names = Object.keys(CONSTELLATIONS);
  const { points, edges } = CONSTELLATIONS[names[Math.floor(rand() * names.length)]];

  // Inset 12-88% (not the full 0-100%) so the constellation's own shape
  // stays clear of the rounded panel corners, then jitter each point by
  // a couple percent so it doesn't look like a perfectly rigid stamp.
  // Coordinates kept as plain 0-100 numbers (not "N%" strings) here so
  // the line endpoints below can reuse the exact same values the dots
  // render at -- line up perfectly with the dots by construction, not
  // by re-deriving matching positions a second time.
  const coords = points.map(([x, y]) => [
    x * 76 + 12 + (rand() - 0.5) * 3,
    y * 76 + 12 + (rand() - 0.5) * 3,
  ]);

  const mainStars = coords.map(([x, y], i) => ({
    left: `${x.toFixed(1)}%`,
    top: `${y.toFixed(1)}%`,
    size: i === 0 ? 2 : 1.5,
    color: i === 0 ? "--horizon-gold-rgb" : "--neon-blue-rgb",
    opacity: i === 0 ? 0.95 : 0.85,
    delay: (rand() * 3).toFixed(1),
    duration: (rand() * 1.4 + 2.2).toFixed(1),
  }));

  const lines = edges.map(([a, b]) => ({
    x1: coords[a][0], y1: coords[a][1],
    x2: coords[b][0], y2: coords[b][1],
  }));

  const filler = Array.from({ length: FILLER_COUNT }, () => ({
    left: `${(rand() * 96 + 2).toFixed(1)}%`,
    top: `${(rand() * 96 + 2).toFixed(1)}%`,
    size: rand() < 0.6 ? 1 : 1.5,
    color: FILLER_COLORS[Math.floor(rand() * FILLER_COLORS.length)],
    opacity: (rand() * 0.35 + 0.3).toFixed(2),
    delay: (rand() * 3.4).toFixed(1),
    duration: (rand() * 1.4 + 2.2).toFixed(1),
  }));

  return { stars: [...mainStars, ...filler], lines };
}

export default function NavStars() {
  const [layout, setLayout] = useState(null);

  useEffect(() => {
    // generateLayout() is Math.random()-based, so it must run client-side
    // only -- rendering it during SSR/first paint would hydration-mismatch.
    // The useState(null) + `return null` until this fires is that pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout(generateLayout());
  }, []);

  if (!layout) return null;

  return (
    <>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        {layout.lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={`rgba(var(--star-dot-rgb), 0.35)`}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {layout.stars.map((s, i) => (
        <span
          key={i}
          className="nav-star"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            background: `rgba(var(${s.color}), ${s.opacity})`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </>
  );
}
