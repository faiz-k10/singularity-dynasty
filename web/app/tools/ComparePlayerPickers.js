"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

const MAX_SUGGESTIONS = 8;
const SLOTS = [1, 2, 3, 4, 5].map((n) => ({ name: `p${n}`, label: `Player ${n}` }));

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
  // The list is filtered only by what he has TYPED: on a field that already holds a player, clicking it shows the whole pool to switch from
  // (the box holds "Jahmyr Gibbs (RB)", which would match nobody).
  const [typed, setTyped] = useState(false);
  const blurTimer = useRef(null);

  const matches = useMemo(() => {
    const q = typed ? query.trim().toLowerCase() : "";
    const pool = q ? players.filter((p) => p.player_name.toLowerCase().includes(q)) : players;
    return pool.slice(0, MAX_SUGGESTIONS);
  }, [players, query, typed]);

  function pick(player) {
    setSelected(player);
    setQuery(displayFor(player));
    setTyped(false);
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setTyped(false);
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
            setTyped(true);
            setOpen(true);
          }}
          onFocus={(e) => {
            setTyped(false);
            setOpen(true);
            e.target.select();
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => {
              setOpen(false);
              setTyped(false);
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

// maxPlayers: how many players this viewer may compare; slots: how many the page offers (Compare Players 5, Compare Simulations 3). When the
// viewer may pick fewer than the page offers, ONE locked slot stands for the rest.
export default function ComparePlayerPickers({ players, defaults, maxPlayers = 3, slots = 3 }) {
  const shown = SLOTS.slice(0, Math.min(slots, maxPlayers + 1));
  return (
    <>
      {shown.map((slot, i) =>
        i < maxPlayers ? (
          <PickerField key={slot.name} slot={slot} players={players} defaultValue={defaults[slot.name] || ""} />
        ) : (
          <div className="compare-form-field" key={slot.name} data-wall="compare-third-slot">
            <span className="feed-label mono">{slot.label}</span>
            <Link href="/#pricing" className="compare-select compare-picker-input compare-locked">
              Add more with Explorer →
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
