"use client";

import { useLayoutEffect, useRef } from "react";

// A box whose text can never spill out of it. The CSS sizes the heading / labels / numbers from the box's width with an estimate of how wide
// their text is (see .weekly-stats-next in globals.css), but real text width depends on the browser's font rendering (the narrow width of
// Martian Mono is a variable-font axis some browsers ignore), so the estimate alone can still clip a letter. This measures the real thing:
// every child marked `data-fit` must fit its own width, and while one overflows the box's --fit factor (it multiplies those font sizes in
// CSS) is lowered a little at a time, down to a floor. Re-measured when the box is resized and when fonts finish loading.
const STEP = 0.03;
const FLOOR = 0.5;

export default function FitBox({ className, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      const marked = el.querySelectorAll("[data-fit]");
      let s = 1;
      el.style.setProperty("--fit", "1");
      // The width of what is INSIDE (a Range sees overflow on both sides; scrollWidth misses what spills out of a centred flex row on the left).
      const range = document.createRange();
      const tooWide = (n) => {
        range.selectNodeContents(n);
        return range.getBoundingClientRect().width > n.clientWidth + 0.5;
      };
      // Text width scales with the font size, so one measurement at full size gives the factor directly (one layout instead of one per 3%
      // step -- inside the big rankings table each forced layout is expensive); the small loop only covers rounding.
      let ratio = 1;
      for (const n of marked) {
        range.selectNodeContents(n);
        const w = range.getBoundingClientRect().width;
        if (w > n.clientWidth + 0.5) ratio = Math.min(ratio, n.clientWidth / w);
      }
      if (ratio < 1) {
        s = Math.max(FLOOR, Math.floor(ratio * 100) / 100);
        el.style.setProperty("--fit", String(s));
        while (s > FLOOR && [...marked].some(tooWide)) {
          s = Math.round((s - STEP) * 100) / 100;
          el.style.setProperty("--fit", String(s));
        }
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
