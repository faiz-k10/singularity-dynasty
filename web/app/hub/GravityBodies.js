"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { formatWin } from "@/lib/standing";
import { orbitAngle } from "@/lib/briefing";

const TRAIL_DEG = 60; // how far round the orbit the fading trail reaches behind each planet
const TRAIL_STEPS = 30;

// The leagues as planets circling the core, each trailing a fading line in its own colour. Positions come from the wall clock (orbitAngle), so a
// refresh or a scroll never restarts or jumps the motion: the server draws each planet where the clock says it is, and in the browser one
// requestAnimationFrame loop moves the planets (transform only) and paints the trails on one canvas. It stops while the map is off screen and for
// anyone who prefers reduced motion (the planets then stay where the clock put them).
export default function GravityBodies({ nodes, k, now }) {
  const canvasRef = useRef(null);
  const nodeRefs = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!canvas || !stage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    let w = 0;
    let h = 0;
    let dpr = 1;
    const size = () => {
      const r = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(stage);

    let colors = [];
    let colorsAt = 0;
    const readColors = () => {
      colors = nodeRefs.current.map((el) => (el ? getComputedStyle(el.firstChild).backgroundColor : "#888"));
    };

    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(stage);

    // Where a planet at angle a (degrees) sits, in px from the stage's top-left: d % of the width across, d x k % of the height down.
    const at = (a, d) => {
      const r = (a * Math.PI) / 180;
      return [w / 2 + Math.cos(r) * d * (w / 100), h / 2 + Math.sin(r) * d * k * (h / 100)];
    };

    let raf = 0;
    function frame(t) {
      raf = 0;
      if (!visible) return;
      const clock = Date.now();
      if (t - colorsAt > 1000) {
        readColors(); // follows a theme switch within a second
        colorsAt = t;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2;
      ctx.lineCap = "butt";
      nodes.forEach((n, i) => {
        const a = orbitAngle(n.angle, clock);
        const el = nodeRefs.current[i];
        if (el) {
          const [x, y] = at(a, n.dist);
          el.style.transform = `translate3d(${x - w / 2}px, ${y - h / 2}px, 0)`;
          el.style.setProperty("--a", `${a}deg`);
        }
        ctx.strokeStyle = colors[i] || "#888";
        const step = TRAIL_DEG / TRAIL_STEPS;
        let prev = at(a, n.dist);
        for (let s = 1; s <= TRAIL_STEPS; s++) {
          const p = at(a - s * step, n.dist);
          ctx.globalAlpha = 0.85 * (1 - s / TRAIL_STEPS) ** 1.6;
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(p[0], p[1]);
          ctx.stroke();
          prev = p;
        }
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [nodes, k]);

  return (
    <>
      <canvas ref={canvasRef} className="gm-trails" aria-hidden="true" />
      {nodes.map((n, i) => (
        <Link
          key={n.id}
          ref={(el) => (nodeRefs.current[i] = el)}
          href="/my-team"
          className={`gm-node is-${n.tone || "grey"}${n.p >= 0.4 && n.p < 0.6 ? " is-close" : ""}`}
          style={{ "--a": `${orbitAngle(n.angle, now)}deg`, "--d": n.dist, "--i": i }}
        >
          <i className="gm-dot" aria-hidden="true" />
          <span className="gm-label mono">
            <span className="gm-label-name">{n.name}</span>
            <span className="gm-label-pct">{formatWin(n.p)}</span>
          </span>
        </Link>
      ))}
    </>
  );
}
