"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { glossaryTerm } from "@/lib/glossary";

// Tap-to-define: wraps a label (a stat name like "xFP") in a button that opens its glossary definition (lib/glossary.js) in
// a small card -- works with a tap on a phone, a click, or the keyboard (Enter / Space, Escape closes). The card is fixed to
// the viewport next to the label, so a narrow panel with hidden overflow can't clip it; it closes on Escape, a click
// elsewhere, scrolling or resizing. An unknown term renders the label unchanged.
const CARD_W = 300;

export default function Define({ term, fallback, children }) {
  const entry = glossaryTerm(term) || (fallback ? glossaryTerm(fallback) : null);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const card = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e) => {
      if (e.key === "Escape") {
        setPos(null);
        btn.current?.focus();
      }
    };
    const onDown = (e) => {
      if (!card.current?.contains(e.target) && !btn.current?.contains(e.target)) setPos(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  if (!entry) return children;

  function toggle(e) {
    e.stopPropagation(); // a label inside a clickable row must not also open / close the row
    if (pos) return setPos(null);
    const r = btn.current.getBoundingClientRect();
    const width = Math.min(CARD_W, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = r.bottom + 8 + 160 < window.innerHeight;
    setPos({ left, width, ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) });
  }

  return (
    <>
      <button ref={btn} type="button" className="def-term" aria-expanded={Boolean(pos)} aria-controls={pos ? id : undefined} onClick={toggle}>
        {children}
      </button>
      {pos && (
        <span ref={card} id={id} role="note" className="def-card" style={pos}>
          <strong className="def-card-term">{entry.full ? `${entry.term}: ${entry.full}` : entry.term}</strong>
          <span className="def-card-text">{entry.def}</span>
          <Link href={`/glossary#${entry.id}`} className="def-card-link mono">
            Full glossary →
          </Link>
        </span>
      )}
    </>
  );
}
