"use client";

import { useId, useMemo, useState } from "react";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";

const MAX_SUGGESTIONS = 8;

// The picked players (a chip each, in his colour, with a remove button) and a type-ahead to add more. Keyboard: arrows move through the
// suggestions, Enter adds the highlighted one, Escape closes the list.
export default function LabPicker({ rows, picked, onToggle, full }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const pickedNames = useMemo(() => new Set(picked.map((p) => p.name)), [picked]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return rows.filter((r) => !pickedNames.has(r.name) && r.name.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS);
  }, [rows, query, pickedNames]);

  const add = (name) => {
    onToggle(name);
    setQuery("");
    setActive(0);
    setOpen(false);
  };

  return (
    <div className="lab-picks">
      <span className="lab-field-label">Players</span>
      <ul className="lab-chips" aria-label="Picked players">
        {picked.map((p) => (
          <li key={p.name} className="lab-chip" style={{ "--c": p.color }}>
            <span className="lab-chip-dot" aria-hidden="true" />
            <span className="lab-chip-name">{p.name}</span>
            <PositionBadge position={p.pos} />
            <button type="button" className="lab-chip-x" onClick={() => onToggle(p.name)} aria-label={`Remove ${p.name}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {!full && (
      <div className="compare-picker lab-picker">
        <input
          type="text"
          className="lab-select lab-picker-input"
          placeholder="Add a player…"
          value={query}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Add a player"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && matches[active]) {
              e.preventDefault();
              add(matches[active].name);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          autoComplete="off"
        />
        {open && matches.length > 0 && (
          <ul className="compare-picker-list" id={listId} role="listbox">
            {matches.map((r, i) => (
              <li key={r.name} role="option" aria-selected={i === active}>
                <button type="button" className={i === active ? "is-active" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => add(r.name)}>
                  <span>{r.name}</span>
                  <span className="lab-pick-meta">
                    <PositionBadge position={r.pos} />
                    <TeamBadge team={r.team} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}
