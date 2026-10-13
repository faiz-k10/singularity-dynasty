"use client";

import { useEffect, useRef, useState } from "react";
import { BADGE_FILTERS, BADGE_GROUPS } from "./badgeFilters";

// The Weekly Projection Rankings filter controls, in one row: position pills, the Badges dropdown (grouped, with an
// OR / AND match toggle), the All players / My players switch (passed in as `view`), and the name search pinned to
// the right. The same element is shown in the normal page and in the full-screen view, so both look identical.
export default function RankingsToolbar({
  positions,
  selected,
  onTogglePosition,
  badgeIds,
  onToggleBadge,
  onClearBadges,
  badgeMatch,
  onBadgeMatch,
  shownCount,
  totalCount,
  query,
  onQuery,
  view,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // Close the dropdown on an outside click or Escape. Escape is caught in the capture phase and stopped, so with the
  // dropdown open it only closes the dropdown (a second Escape then leaves the full-screen view).
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="rk-controls">
      {Array.isArray(positions) && positions.length > 0 && (
        <div className="rk-positions" role="group" aria-label="Positions">
          {positions.map((pos) => (
            <button
              key={pos}
              type="button"
              className={selected.includes(pos) ? "active" : ""}
              onClick={() => onTogglePosition(pos)}
              aria-pressed={selected.includes(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
      )}

      <div className="theater-badge-filter" ref={ref}>
        <button
          type="button"
          className={`theater-badge-filter-btn${badgeIds.size > 0 ? " has-selection" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          Badges
          {badgeIds.size > 0 && (
            <span className="theater-badge-filter-count">
              {badgeIds.size}
              {badgeIds.size > 1 ? ` · ${badgeMatch.toUpperCase()}` : ""}
            </span>
          )}
          <span className={`theater-badge-filter-chevron${open ? " open" : ""}`}>▾</span>
        </button>
        {open && (
          <div className="theater-badge-filter-panel" role="dialog" aria-label="Filter players by badge">
            <div className="tbf-head">
              <span className="tbf-title">Filter by badge</span>
              <div className="tbf-mode" role="group" aria-label="How to match the selected badges">
                {["or", "and"].map((m) => (
                  <button key={m} type="button" className={badgeMatch === m ? "on" : ""} aria-pressed={badgeMatch === m} onClick={() => onBadgeMatch(m)}>
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <p className="tbf-hint">
              {badgeMatch === "or"
                ? "Show players who have any of the selected badges."
                : "Show only players who have all of the selected badges."}
            </p>
            {BADGE_GROUPS.map((g) => (
              <div key={g.label} className="tbf-group">
                <span className="tbf-group-label">{g.label}</span>
                <div className="tbf-group-pills">
                  {g.ids.map((id) => {
                    const f = BADGE_FILTERS.find((x) => x.id === id);
                    const on = badgeIds.has(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`theater-badge-pill ${on ? "active" : ""}`}
                        onClick={() => onToggleBadge(id)}
                        aria-pressed={on}
                      >
                        <span className={`player-achv-dot ${f.variant}`} />
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="tbf-foot">
              <span className="tbf-count">
                {badgeIds.size === 0 ? `All ${totalCount} players` : `${shownCount} of ${totalCount} players`}
              </span>
              {badgeIds.size > 0 && (
                <button type="button" className="theater-badge-filter-clear" onClick={onClearBadges}>
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {view}

      <label className="rk-search">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
        <input type="search" placeholder="Search a player's name…" value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Search players" />
      </label>
    </div>
  );
}
