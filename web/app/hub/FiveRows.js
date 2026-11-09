"use client";

import { useEffect, useRef } from "react";

// Wraps the home briefing's matchup table: the box is exactly as tall as the header plus five rows (measured, because a row is taller on a
// phone than on a desktop), and any further matchups scroll inside it. With five or fewer there is nothing to scroll and no limit.
export default function FiveRows({ max = 5, children }) {
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => {
      const rows = el.querySelectorAll("tbody tr");
      if (rows.length <= max) {
        el.style.maxHeight = "";
        return;
      }
      // the top of the first row that is NOT shown = header + max rows
      el.style.maxHeight = `${rows[max].offsetTop}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return (
    <div className="yw-scroll" ref={box}>
      {children}
    </div>
  );
}
