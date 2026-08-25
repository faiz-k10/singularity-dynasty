// 20 small dots for the Pricing nav dropdown's background (see
// globals.css's .nav-star for the shared shape/animation properties).
// Rendered as real elements, each with its own animation-delay/duration
// set here, so they twinkle independently instead of one shared
// background-image pulsing as a single flat unit. Position/size/color/
// opacity/timing are all fixed per star (not randomized at render) so
// server and client markup match exactly -- no hydration mismatch.
const STARS = [
  { left: "15%", top: "20%", size: 2, color: "--neon-blue-rgb", opacity: 0.9, delay: 0, duration: 2.6 },
  { left: "85%", top: "18%", size: 1.5, color: "--horizon-gold-rgb", opacity: 0.75, delay: 1.4, duration: 3.1 },
  { left: "90%", top: "58%", size: 2, color: "--neon-blue-rgb", opacity: 0.8, delay: 0.6, duration: 2.9 },
  { left: "10%", top: "62%", size: 1.5, color: "--horizon-gold-rgb", opacity: 0.7, delay: 2.2, duration: 3.4 },
  { left: "50%", top: "88%", size: 1.5, color: "--neon-blue-rgb", opacity: 0.75, delay: 0.3, duration: 2.4 },
  { left: "35%", top: "38%", size: 1, color: "--star-dot-rgb", opacity: 0.55, delay: 1.8, duration: 3.2 },
  { left: "68%", top: "92%", size: 1.5, color: "--horizon-gold-rgb", opacity: 0.65, delay: 0.9, duration: 2.7 },
  { left: "25%", top: "78%", size: 1, color: "--star-dot-rgb", opacity: 0.5, delay: 2.6, duration: 3.6 },
  { left: "95%", top: "30%", size: 1.5, color: "--horizon-gold-rgb", opacity: 0.6, delay: 1.1, duration: 2.5 },
  { left: "60%", top: "12%", size: 1, color: "--neon-blue-rgb", opacity: 0.6, delay: 3.0, duration: 3.0 },
  { left: "40%", top: "10%", size: 1.5, color: "--horizon-gold-rgb", opacity: 0.55, delay: 0.4, duration: 2.8 },
  { left: "5%", top: "35%", size: 1, color: "--neon-blue-rgb", opacity: 0.5, delay: 1.7, duration: 3.3 },
  { left: "75%", top: "40%", size: 1.5, color: "--star-dot-rgb", opacity: 0.45, delay: 2.4, duration: 2.6 },
  { left: "55%", top: "60%", size: 1, color: "--horizon-gold-rgb", opacity: 0.55, delay: 0.8, duration: 3.5 },
  { left: "30%", top: "95%", size: 1.5, color: "--neon-blue-rgb", opacity: 0.6, delay: 2.0, duration: 2.3 },
  { left: "98%", top: "80%", size: 1, color: "--horizon-gold-rgb", opacity: 0.5, delay: 1.3, duration: 3.1 },
  { left: "20%", top: "50%", size: 1.5, color: "--neon-blue-rgb", opacity: 0.55, delay: 2.8, duration: 2.9 },
  { left: "80%", top: "75%", size: 1, color: "--star-dot-rgb", opacity: 0.4, delay: 0.2, duration: 3.4 },
  { left: "62%", top: "30%", size: 1.5, color: "--horizon-gold-rgb", opacity: 0.5, delay: 1.9, duration: 2.5 },
  { left: "45%", top: "70%", size: 1, color: "--neon-blue-rgb", opacity: 0.5, delay: 3.2, duration: 3.0 },
];

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
