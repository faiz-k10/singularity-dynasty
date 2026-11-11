"use client";

// Flip light / dark: data-theme on <html>, remembered in localStorage (layout.js reads it before the first paint).
function flipTheme() {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const next = current === "light" ? "dark" : "light";
  // Freeze every transition for the flip so all colours change in the same frame (elements with their own colour transitions otherwise lag behind, which looks staggered on the big tables).
  root.classList.add("theme-switching");
  root.setAttribute("data-theme", next);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Safari private mode etc. -- the theme just won't persist.
  }
}

// A square two-cell switch: sun | moon, the cell for the current theme filled (see .theme-toggle in globals.css). One button, so a click
// anywhere flips the theme. The header's copy is fixed at the top right; `inline` sits in a toolbar (the Game Board's top bar).
export default function ThemeToggle({ inline = false }) {
  return (
    <button type="button" className={`theme-toggle${inline ? " is-inline" : ""}`} onClick={flipTheme} aria-label="Toggle light/dark theme">
      <span className="tt-cell tt-sun">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
        </svg>
      </span>
      <span className="tt-cell tt-moon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        </svg>
      </span>
    </button>
  );
}
