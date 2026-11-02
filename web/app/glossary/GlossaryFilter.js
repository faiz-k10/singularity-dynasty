"use client";

import { useState } from "react";

// Narrows the glossary as you type: hides terms (and empty sections) that don't mention the words. The full list is in the
// page's HTML, so search engines and readers without JavaScript still get every term.
function applyFilter(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let n = 0;
  for (const sec of document.querySelectorAll(".gl-group")) {
    let any = false;
    for (const item of sec.querySelectorAll(".gl-item")) {
      const hit = words.every((w) => item.dataset.search.includes(w));
      item.hidden = !hit;
      if (hit) {
        any = true;
        n++;
      }
    }
    sec.hidden = !any;
  }
  return words.length ? n : null;
}

export default function GlossaryFilter() {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(null);
  return (
    <div className="gl-filter">
      <label htmlFor="gl-q" className="sr-only">
        Find a term
      </label>
      <input
        id="gl-q"
        type="search"
        className="feed-input auth-input"
        placeholder="Find a term (e.g. WOPR, ceiling)…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setShown(applyFilter(e.target.value));
        }}
        autoComplete="off"
      />
      <p className="gl-count mono" aria-live="polite">
        {shown == null ? "" : shown === 0 ? "No terms match." : `${shown} term${shown === 1 ? "" : "s"} match.`}
      </p>
    </div>
  );
}
