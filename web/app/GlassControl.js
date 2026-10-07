"use client";

import { useEffect, useRef, useState } from "react";

// Golden Gate's "Liquid Glass" opacity slider, for this site: how see-through the glass panels
// are, from clear (the starfield shows through) to tinted (more opaque, easiest to read).
// 0..100 maps to --glass-alpha .2 to .8; the layout's early script applies the saved value
// before first paint so there is no flash. A convenience, so every storage call is try/caught.
const KEY = "glass";
const DEFAULT = 50;
const alphaFor = (v) => (0.2 + 0.006 * v).toFixed(3);

function apply(v) {
  document.documentElement.style.setProperty("--glass-alpha", alphaFor(v));
}

export default function GlassControl() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(DEFAULT);
  const box = useRef(null);

  useEffect(() => {
    try {
      const saved = parseInt(localStorage.getItem(KEY), 10);
      if (!Number.isNaN(saved)) setValue(Math.min(100, Math.max(0, saved)));
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function change(v) {
    setValue(v);
    apply(v);
    try {
      localStorage.setItem(KEY, String(v));
    } catch {}
  }

  return (
    <div className="glass-control" ref={box}>
      <button
        type="button"
        className="glass-control-btn"
        aria-label="Glass transparency"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3 3 8l9 5 9-5-9-5Z" />
          <path d="m3 13 9 5 9-5" />
        </svg>
      </button>
      {open && (
        <div className="glass-control-pop" role="dialog" aria-label="Glass transparency">
          <div className="glass-control-title">Glass</div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={value}
            onChange={(e) => change(Number(e.target.value))}
            aria-label="Glass transparency from clear to tinted"
          />
          <div className="glass-control-ends">
            <span>Clear</span>
            <span>Tinted</span>
          </div>
          {value !== DEFAULT && (
            <button type="button" className="glass-control-reset" onClick={() => change(DEFAULT)}>
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
