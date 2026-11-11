"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// How many rows of a long table to mount right now: the first chunk at once, so the page shows up in a fraction of the time (a 480-row table of
// SVG curves, badges and logos took 3-4 seconds to build on a normal laptop before anything appeared), then the rest in idle-time chunks.
// Every row ends up mounted (filters and sorts still work on all of them), usually within a second or two.
// Each chunk is sized to the time the browser says it has free (Nov 10 2026, founder: the Tools menu felt choppy right after opening a tool --
// fixed 48-row chunks blocked the page for a few hundred ms each, so a hover had to wait): the hook measures how long a row takes to build and
// adds only as many as fit in the idle slot (at least 4), so a hover or click never waits long.
export default function useProgressiveCount(total, first = 24, maxStep = 48) {
  const [count, setCount] = useState(first);
  const perRow = useRef(4); // ms to build one row, learned from each chunk
  const started = useRef(0);
  const added = useRef(0);
  useLayoutEffect(() => {
    if (!started.current || !added.current) return;
    const ms = performance.now() - started.current;
    perRow.current = Math.max(0.5, perRow.current * 0.5 + (ms / added.current) * 0.5);
    started.current = 0;
  }, [count]);
  useEffect(() => {
    if (count >= total) return undefined;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 16));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(
      (deadline) => {
        const budget = Math.max(6, Math.min(16, deadline.timeRemaining()));
        const n = Math.max(4, Math.min(maxStep, Math.floor(budget / perRow.current)));
        added.current = Math.min(n, total - count);
        started.current = performance.now();
        setCount((c) => Math.min(total, c + n));
      },
      { timeout: 500 }
    );
    return () => cancel(id);
  }, [count, total, maxStep]);
  return Math.min(count, total);
}
