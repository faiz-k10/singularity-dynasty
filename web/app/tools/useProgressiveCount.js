"use client";

import { useEffect, useState } from "react";

// How many rows of a long table to mount right now: the first chunk at once, so the page shows up in a fraction of the time (a 480-row table of
// SVG curves, badges and logos took 3-4 seconds to build on a normal laptop before anything appeared), then the rest in idle-time chunks so
// the page stays responsive. Every row ends up mounted (filters and sorts still work on all of them), usually within a second or two.
export default function useProgressiveCount(total, first = 24, step = 48) {
  const [count, setCount] = useState(first);
  useEffect(() => {
    if (count >= total) return undefined;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 16));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => setCount((c) => Math.min(total, c + step)), { timeout: 120 });
    return () => cancel(id);
  }, [count, total, step]);
  return Math.min(count, total);
}
