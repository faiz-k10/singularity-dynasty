"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

const MAX_SUGGESTIONS = 8;
const SLOTS = [
  { name: "p1", label: "Player 1" },
  { name: "p2", label: "Player 2" },
  { name: "p3", label: "Player 3" },
];

function displayFor(player) {
  return player ? `${player.player_name} (${player.position})` : "";
}

// Type-ahead replacement for a plain <select> -- with the pool now running
// into the hundreds, a flat option list stopped being usable. Still backs
// a real form field (the hidden input below) so the surrounding <form>'s
// plain GET submission and shareable ?p1=&p2=&p3= URLs are untouched.
function PickerField({ slot, players, defaultValue }) {
  const defaultPlayer = players.find((p) => p.player_name === defaultValue) || null;
  const [query, setQuery] = useState(displayFor(defaultPlayer));
  const [selected, setSelected] = useState(defaultPlayer);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? players.filter((p) => p.player_name.toLowerCase().includes(q)) : players;
    return pool.slice(0, MAX_SUGGESTIONS);
  }, [players, query]);

  function pick(player) {
    setSelected(player);
    setQuery(displayFor(player));
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    setQuery("");
  }

  return (
    <div className="compare-form-field">
      <label htmlFor={slot.name} className="feed-label mono">
        {slot.label}
      </label>
      <div className="compare-picker">
        <input
          id={slot.name}
          type="text"
          className="compare-select compare-picker-input"
          placeholder="Search a player…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => {
              setOpen(false);
              setQuery(displayFor(selected));
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          autoComplete="off"
        />
        {selected && (
          <button type="button" className="compare-picker-clear" onClick={clear} aria-label={`Clear ${slot.label}`}>
            ×
          </button>
        )}
        <input type="hidden" name={slot.name} value={selected?.player_name || ""} />
        {open && matches.length > 0 && (
          <ul className="compare-picker-list">
            {matches.map((p) => (
              <li key={p.player_name}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
                  {p.player_name} <span className="compare-picker-pos">{p.position}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// maxPlayers: how many players this viewer may compare (Stargazer 2, Explorer and up 3). Slots past it show as locked.
export default function ComparePlayerPickers({ players, defaults, maxPlayers = 3 }) {
  return (
    <>
      {SLOTS.map((slot, i) =>
        i < maxPlayers ? (
          <PickerField key={slot.name} slot={slot} players={players} defaultValue={defaults[slot.name] || ""} />
        ) : (
          <div className="compare-form-field" key={slot.name}>
            <span className="feed-label mono">{slot.label}</span>
            <Link href="/#pricing" className="compare-select compare-picker-input compare-locked">
              Add a third with Explorer →
            </Link>
          </div>
        )
      )}
      <button type="submit" className="btn-primary compare-submit">
        Compare
      </button>
    </>
  );
}
