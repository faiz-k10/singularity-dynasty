// Star dots for the Pricing nav dropdown's background (see globals.css's
// .nav-star for the shared shape/animation properties). Rendered as real
// elements, each with its own animation-delay/duration, so they twinkle
// independently instead of one shared background-image pulsing as a
// single flat unit.
const STAR_COUNT = 50;
const COLORS = ["--neon-blue-rgb", "--horizon-gold-rgb", "--star-dot-rgb"];

// Deterministic pseudo-random (mulberry32, fixed seed) -- NOT
// Math.random(), which would compute a different star layout on the
// server render vs. the client hydration pass and throw a hydration
// mismatch. Same seed always produces the same 50 stars.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1337);
const STARS = Array.from({ length: STAR_COUNT }, (_, i) => ({
  left: `${(rand() * 96 + 2).toFixed(1)}%`,
  top: `${(rand() * 96 + 2).toFixed(1)}%`,
  size: rand() < 0.5 ? 1 : 1.5,
  color: COLORS[i % COLORS.length],
  opacity: (rand() * 0.4 + 0.4).toFixed(2),
  delay: (rand() * 3.4).toFixed(1),
  duration: (rand() * 1.4 + 2.2).toFixed(1),
}));

export default function NavStars() {
  return (
    <>
      {STARS.map((s, i) => (
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
