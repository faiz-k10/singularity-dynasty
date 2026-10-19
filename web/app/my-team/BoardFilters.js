"use client";

import { useEffect, useRef, useState } from "react";
import { FILTER_GROUPS, filterCount, optionCounts } from "@/lib/boardFilters";

// The Sunday board's league filters: one "Filter" pill in the header strip that opens a panel with four rows -- league
// type, win chance, score and playoff odds -- each a set of chips with how many leagues carry that choice (choices no
// league has are left out). Pick any chips: a league shows when it matches one choice in every row that has a pick.
// Same dropdown look as the Weekly Projection Rankings toolbar (Badges / Teams). Esc or an outside click closes it.
export default function BoardFilters({ filters, onChange, factsList, shown, total }) {
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

  const counts = optionCounts(factsList);
  const active = filterCount(filters);
  const toggle = (group, id) => {
    const next = { ...filters, [group]: new Set(filters[group]) };
    if (next[group].has(id)) next[group].delete(id);
    else next[group].add(id);
    onChange(next);
  };
  const clear = () => onChange({ types: new Set(), standing: new Set(), score: new Set(), odds: new Set() });

  return (
    <div className="theater-badge-filter sb-filter" ref={ref}>
      <button
        type="button"
        className={`theater-badge-filter-btn${active > 0 ? " has-selection" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        Filter
        {active > 0 && <span className="theater-badge-filter-count">{active}</span>}
        <span className={`theater-badge-filter-chevron${open ? " open" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="theater-badge-filter-panel sb-filter-panel" role="dialog" aria-label="Filter leagues">
          <div className="tbf-head">
            <span className="tbf-title">Filter leagues</span>
          </div>
          <p className="tbf-hint">Pick any chips. A league shows when it matches one pick in every row you use.</p>
          {FILTER_GROUPS.map((g) => {
            const options = g.options.filter((o) => counts[g.key][o.id] > 0 || filters[g.key].has(o.id));
            if (!options.length) return null;
            return (
              <div key={g.key} className="tbf-group">
                <span className="tbf-group-label">{g.label}</span>
                <div className="tbf-group-pills">
                  {options.map((o) => {
                    const on = filters[g.key].has(o.id);
                    return (
                      <button key={o.id} type="button" className={`theater-badge-pill${on ? " active" : ""}`} aria-pressed={on} onClick={() => toggle(g.key, o.id)}>
                        {o.label}
                        {o.hint && <span className="sb-filter-hint">{o.hint}</span>}
                        <span className="sb-filter-n">{counts[g.key][o.id] || 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="tbf-foot">
            <span className="tbf-count">{active === 0 ? `All ${total} leagues` : `${shown} of ${total} leagues`}</span>
            {active > 0 && (
              <button type="button" className="theater-badge-filter-clear" onClick={clear}>
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
