"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ownedFor, myPlayerCount } from "@/lib/myPlayers";

// Shared "personal dimension" pieces for Player Season Simulations and Weekly Projection
// Rankings: one hook that owns the My-players view state, the toggle row, the star next to
// a player's name, and the "you own him" strip inside an opened player.

export function useMyView(mine, rows) {
  const [on, setOn] = useState(false);
  const [league, setLeague] = useState("all");
  const ownedByName = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const o = ownedFor(mine, r.player_name, league);
      if (o) m.set(r.player_name, o);
    }
    return m;
  }, [mine, rows, league]);
  const total = useMemo(() => myPlayerCount(mine, league), [mine, league]);
  return { on, setOn, league, setLeague, ownedByName, matched: ownedByName.size, total };
}

// The line under the filter toolbar when the My players view is on ("83 of your 118 players are here").
export function MyPlayersNote({ mine, view, gated }) {
  if (!mine?.signedIn || mine.teams.length === 0 || !view.on) return null;
  const { matched, total } = view;
  return (
    <span className="my-filter-note">
      {matched} of your {total} {total === 1 ? "player is" : "players are"} here
      {gated && matched < total && (
        <>
          {" · "}
          <Link href="/#pricing" prefetch={false}>
            see all
          </Link>
        </>
      )}
    </span>
  );
}

// `compact`: just the All players / My players switch (and the team picker once My players is on), for a toolbar row;
// the count line is MyPlayersNote.
export function MyPlayersFilter({ mine, view, gated, compact }) {
  if (!mine?.signedIn) {
    return (
      <Link href="/login" prefetch={false} className="my-filter-cta">
        ★ Sign in to see your players
      </Link>
    );
  }
  if (mine.teams.length === 0) {
    return (
      <Link href="/my-team" prefetch={false} className="my-filter-cta">
        ★ Add your team to see your players
      </Link>
    );
  }
  const { on, setOn, league, setLeague, matched, total } = view;
  if (compact) {
    return (
      <>
        <div className="tier-toggle my-filter-toggle" role="group" aria-label="Player view">
          <button type="button" className={on ? "" : "active"} aria-pressed={!on} onClick={() => setOn(false)}>
            All players
          </button>
          <button type="button" className={on ? "active" : ""} aria-pressed={on} onClick={() => setOn(true)}>
            ★ My players
          </button>
        </div>
        {on && mine.teams.length > 1 && (
          <select className="my-filter-select" value={league} onChange={(e) => setLeague(e.target.value)} aria-label="Which of your teams">
            <option value="all">All my teams</option>
            {mine.teams.map((t, i) => (
              <option key={i} value={String(i)}>
                {t}
              </option>
            ))}
          </select>
        )}
      </>
    );
  }
  return (
    <div className="my-filter">
      <div className="tier-toggle my-filter-toggle" role="group" aria-label="Player view">
        <button type="button" className={on ? "" : "active"} aria-pressed={!on} onClick={() => setOn(false)}>
          All players
        </button>
        <button type="button" className={on ? "active" : ""} aria-pressed={on} onClick={() => setOn(true)}>
          ★ My players
        </button>
      </div>
      {mine.teams.length > 1 && (
        <select
          className="my-filter-select"
          value={league}
          onChange={(e) => setLeague(e.target.value)}
          aria-label="Which of your teams"
        >
          <option value="all">All my teams</option>
          {mine.teams.map((t, i) => (
            <option key={i} value={String(i)}>
              {t}
            </option>
          ))}
        </select>
      )}
      <span className="my-filter-note">
        {matched} of your {total} {total === 1 ? "player is" : "players are"} here
        {gated && matched < total && (
          <>
            {" · "}
            <Link href="/#pricing" prefetch={false}>
              see all
            </Link>
          </>
        )}
      </span>
    </div>
  );
}

// The star before a name: filled when he starts for you, hollow when he is on your bench.
export function MyBadge({ owned }) {
  if (!owned) return null;
  const where = owned.leagues.map((l) => `${l.label} (${l.starter ? "starter" : "bench"})`).join(", ");
  return (
    <span
      className={`mine-badge${owned.starter ? "" : " mine-badge-bench"}`}
      title={`On your roster: ${where}`}
      aria-label={`On your roster: ${where}`}
    >
      {owned.starter ? "★" : "☆"}
      {owned.leagues.length > 1 && <span className="mine-badge-n">{owned.leagues.length}</span>}
    </span>
  );
}

// The far-right panel's empty state, for a player who is on none of the viewer's saved teams (or a viewer with no
// saved teams / not signed in). `status`: "signedOut" | "noTeams" | "ready".
export function MyEmpty({ status }) {
  return (
    <div className="mine-strip mine-strip-vertical">
      <span className="mine-strip-star">★ Your player</span>
      {status === "signedOut" ? (
        <Link href="/login" prefetch={false} className="mine-empty-note">Sign in to see which of your teams he is on</Link>
      ) : status === "noTeams" ? (
        <Link href="/my-team" prefetch={false} className="mine-empty-note">Add your team to see where he is</Link>
      ) : (
        <span className="mine-empty-note">Not on any of your teams</span>
      )}
    </div>
  );
}

export function MyStrip({ owned, vertical = false }) {
  if (!owned) return null;
  return (
    <div className={`mine-strip${vertical ? " mine-strip-vertical" : ""}`}>
      <span className="mine-strip-star">★ Your player</span>
      {owned.leagues.map((l, i) => (
        <span key={i} className="mine-strip-chip">
          {l.label}
          <span className={l.starter ? "mine-strip-role starter" : "mine-strip-role"}>{l.starter ? "starter" : "bench"}</span>
        </span>
      ))}
    </div>
  );
}
