"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BADGE_FILTERS, BADGE_GROUPS } from "./badgeFilters";
import TeamBadge from "./TeamBadge";
import { NFL_DIVISIONS } from "@/lib/nflDivisions";
import { symbolSvg } from "@/lib/badgeIcons";

// The Weekly Projection Rankings filter controls, in one row: position pills, the Badges dropdown (grouped, with an
// OR / AND match toggle), the Teams dropdown (by division), the All players / My players switch (passed in as `view`), and the name search pinned to
// the right. The same element is shown in the normal page and in the full-screen view, so both look identical.
// Open/close state for a toolbar dropdown: closes on an outside click or Escape. Escape is caught in the capture phase and
// stopped, so with a dropdown open it only closes the dropdown (a second Escape then leaves the full-screen view).
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
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
  return [open, setOpen, ref];
}

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
  teamIds,
  onToggleTeam,
  onClearTeams,
  compareHref,
  filterLabel = "Badges", // the first dropdown's name (Season Simulations calls it Tags)
  filterWord = "badge",
  filterGroups, // [{ label, items: [{ id, label, variant?, tone? }] }] -- the badge groups by default
}) {
  const [open, setOpen, ref] = useDropdown();
  const [teamsOpen, setTeamsOpen, teamsRef] = useDropdown();
  const groups = filterGroups || BADGE_GROUPS.map((g) => ({ label: g.label, items: g.ids.map((id) => BADGE_FILTERS.find((x) => x.id === id)) }));

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

      {badgeIds && (
      <div className="theater-badge-filter" ref={ref}>
        <button
          type="button"
          className={`theater-badge-filter-btn${badgeIds.size > 0 ? " has-selection" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          {filterLabel}
          {badgeIds.size > 0 && (
            <span className="theater-badge-filter-count">
              {badgeIds.size}
              {badgeIds.size > 1 ? ` · ${badgeMatch.toUpperCase()}` : ""}
            </span>
          )}
          <span className={`theater-badge-filter-chevron${open ? " open" : ""}`}>▾</span>
        </button>
        {open && (
          <div className="theater-badge-filter-panel" role="dialog" aria-label={`Filter players by ${filterWord}`}>
            <div className="tbf-head">
              <span className="tbf-title">Filter by {filterWord}</span>
              <div className="tbf-mode" role="group" aria-label={`How to match the selected ${filterWord}s`}>
                {["or", "and"].map((m) => (
                  <button key={m} type="button" className={badgeMatch === m ? "on" : ""} aria-pressed={badgeMatch === m} onClick={() => onBadgeMatch(m)}>
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <p className="tbf-hint">
              {badgeMatch === "or"
                ? `Show players who have any of the selected ${filterWord}s.`
                : `Show only players who have all of the selected ${filterWord}s.`}
            </p>
            {groups.map((g) => (
              <div key={g.label} className="tbf-group">
                <span className="tbf-group-label">{g.label}</span>
                <div className="tbf-group-pills">
                  {g.items.map((f) => {
                    const id = f.id;
                    const on = badgeIds.has(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`theater-badge-pill ${on ? "active" : ""}`}
                        onClick={() => onToggleBadge(id)}
                        aria-pressed={on}
                      >
                        {f.tone ? (
                          <span className={`player-achv-dot tbf-tone-dot tone-${f.tone}`} />
                        ) : (
                          // the badge itself, at ticker size (the same ringed svg the ticker draws)
                          <span className={`sym-badge ${f.variant || ""}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: symbolSvg(f.icon || f.id) }} />
                        )}
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
      )}

      {teamIds && (
        <div className="theater-badge-filter" ref={teamsRef}>
          <button
            type="button"
            className={`theater-badge-filter-btn${teamIds.size > 0 ? " has-selection" : ""}`}
            onClick={() => setTeamsOpen((v) => !v)}
            aria-expanded={teamsOpen}
            aria-haspopup="dialog"
          >
            Teams
            {teamIds.size > 0 && <span className="theater-badge-filter-count">{teamIds.size}</span>}
            <span className={`theater-badge-filter-chevron${teamsOpen ? " open" : ""}`}>▾</span>
          </button>
          {teamsOpen && (
            <div className="theater-badge-filter-panel team-filter-panel" role="dialog" aria-label="Filter players by team">
              <div className="tbf-head">
                <span className="tbf-title">Filter by team</span>
              </div>
              <div className="tf-confs">
                {["AFC", "NFC"].map((conf) => (
                  <div key={conf} className="tf-conf">
                    {NFL_DIVISIONS.filter((d) => d.conf === conf).map((d) => (
                      <div key={d.name} className="tf-div">
                        <span className="tbf-group-label">{d.name}</span>
                        <div className="tf-teams">
                          {d.teams.map((t) => {
                            const on = teamIds.has(t);
                            return (
                              <button key={t} type="button" className={`tf-team${on ? " on" : ""}`} onClick={() => onToggleTeam(t)} aria-pressed={on}>
                                <TeamBadge team={t} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="tbf-foot">
                <span className="tbf-count">
                  {teamIds.size === 0 ? `All ${totalCount} players` : `${shownCount} of ${totalCount} players`}
                </span>
                {teamIds.size > 0 && (
                  <button type="button" className="theater-badge-filter-clear" onClick={onClearTeams}>
                    Clear all
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {view}

      {compareHref && (
        <Link href={compareHref} prefetch={false} className="theater-badge-filter-btn rk-compare">
          Player Comparison
        </Link>
      )}

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
