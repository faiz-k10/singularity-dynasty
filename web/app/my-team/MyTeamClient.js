"use client";

import { useState, useTransition } from "react";
import { lookupSleeperTeams, saveTeam, deleteTeam } from "./actions";
import TeamBadge from "../tools/TeamBadge";
import PositionBadge from "../tools/PositionBadge";
import { sortRows, sortArrow } from "@/lib/sortLink";

// Display-only relabel -- Sleeper's own roster_positions/starters value is
// the literal string "SUPER_FLEX"; sorting/matching still uses that raw
// value everywhere, this just renders it without the underscore.
function formatSlot(slot) {
  if (!slot) return "BN";
  return slot === "SUPER_FLEX" ? "SUPERFLEX" : slot;
}

// Deliberately an OUTLINE pill (transparent fill, colored border+text via
// currentColor) rather than PositionBadge's solid fill -- Slot and
// Position are genuinely different facts (a FLEX slot says nothing about
// which position fills it) that happened to look like duplicated color
// coding when Slot was a plain-text first column sitting right next to
// the position-stripe every .rankings-table already draws on its own
// first cell. Single-position slots borrow that position's color; FLEX/
// SUPERFLEX (not tied to one position) get their own accent instead.
const SLOT_COLOR_VAR = {
  QB: "--pos-qb",
  RB: "--pos-rb",
  WR: "--pos-wr",
  TE: "--pos-te",
  FLEX: "--neon-blue",
  SUPER_FLEX: "--horizon-gold",
};

function SlotBadge({ slot }) {
  if (!slot) return <span className="mono">BN</span>;
  const colorVar = SLOT_COLOR_VAR[slot];
  return (
    <span className="slot-badge" style={colorVar ? { color: `var(${colorVar})` } : undefined}>
      {formatSlot(slot)}
    </span>
  );
}

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

// League format at a glance -- teams / roster spots / QB format / scoring
// / TE premium, straight from Sleeper's own league object (see
// actions.js). TE premium only renders when the league actually has one;
// not every league does.
function LeagueBadges({ settings }) {
  if (!settings || !settings.teams) return null;
  return (
    <div className="my-team-settings">
      <span className="my-team-setting-pill pill-teams">{settings.teams} Teams</span>
      {settings.rosterSpots && (
        <span className="my-team-setting-pill pill-roster">{settings.rosterSpots} Roster Spots</span>
      )}
      <span className="my-team-setting-pill pill-qb">{settings.qbFormat}</span>
      <span className="my-team-setting-pill pill-scoring">{settings.scoring}</span>
      {settings.tePremium && (
        <span className="my-team-setting-pill pill-te">{settings.tePremium}</span>
      )}
    </div>
  );
}

function sortByPosition(players) {
  return [...players].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a.position);
    const bi = POSITION_ORDER.indexOf(b.position);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi || a.name.localeCompare(b.name);
  });
}

function formatPct(v) {
  return v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
}

const ROSTER_COLUMN_TYPES = {
  slot: "string",
  name: "string",
  position: "string",
  team: "string",
  rosterPct: "number",
  startPct: "number",
};

// Reuses lib/sortLink's own comparator/arrow so this matches every other
// table's sort behavior exactly (first click = descending, then toggles)
// -- just driven by local React state instead of the URL, since this
// roster preview isn't its own page/searchParams the way /tools/* are.
function Th({ label, sortKeyName, sortKey, sortDir, onSort, className }) {
  return (
    <th className={className}>
      <button
        type="button"
        className={`th-sort-btn${sortKey === sortKeyName ? " sort-active" : ""}`}
        onClick={() => onSort(sortKeyName)}
      >
        {label}
        {sortArrow(sortKeyName, sortKey, sortDir)}
      </button>
    </th>
  );
}

// Defaults to the CURRENT STARTING LINEUP, in Sleeper's own slot order
// (QB, RB, RB, WR, WR, TE, FLEX, FLEX, SUPER_FLEX, ... -- whatever this
// league's roster_positions actually defines, see actions.js's
// slotIndex), not just players grouped by position. "Full Roster" toggle
// reveals the bench. Every column is sortable via local state; switching
// the Starters/Full Roster toggle resets any active sort back to that
// view's own default order, rather than carrying a sort across into a
// view it wasn't set on.
function RosterTable({ players }) {
  const hasStarters = players.some((p) => p.isStarter);
  const [view, setView] = useState(hasStarters ? "starters" : "full");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");

  const base = view === "starters" ? players.filter((p) => p.isStarter) : players;

  let rows;
  if (sortKey) {
    rows = sortRows(base, sortKey, sortDir, ROSTER_COLUMN_TYPES);
  } else if (view === "starters") {
    rows = [...base].sort((a, b) => a.slotIndex - b.slotIndex);
  } else {
    rows = sortByPosition(base);
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleViewChange(nextView) {
    setView(nextView);
    setSortKey(null);
    setSortDir("desc");
  }

  const thProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <div>
      {hasStarters && (
        <div className="board-toggle my-team-view-toggle">
          <button
            type="button"
            className={view === "starters" ? "active" : ""}
            onClick={() => handleViewChange("starters")}
          >
            Starting Lineup
          </button>
          <button
            type="button"
            className={view === "full" ? "active" : ""}
            onClick={() => handleViewChange("full")}
          >
            Full Roster
          </button>
        </div>
      )}
      <div className="rankings-table-wrap">
        <table className="rankings-table">
          <thead>
            <tr>
              <Th label="Player" sortKeyName="name" className="align-left" {...thProps} />
              {view === "starters" && <Th label="Slot" sortKeyName="slot" {...thProps} />}
              <Th label="Pos" sortKeyName="position" {...thProps} />
              <Th label="Team" sortKeyName="team" {...thProps} />
              <Th label="Roster %" sortKeyName="rosterPct" {...thProps} />
              <Th label="Start %" sortKeyName="startPct" {...thProps} />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.player_id} data-pos={p.position || undefined}>
                <td className="player-cell align-left">{p.name}</td>
                {view === "starters" && <td><SlotBadge slot={p.slot} /></td>}
                <td><PositionBadge position={p.position} /></td>
                <td><TeamBadge team={p.team} /></td>
                <td className="mono">{formatPct(p.rosterPct)}</td>
                <td className="mono">{formatPct(p.startPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// isSignedIn gates the Save button only -- the lookup itself works
// signed out too (it's a read-only call against Sleeper's public API, no
// Supabase involved), so a visitor can preview their team before ever
// creating an account.
export default function MyTeamClient({ isSignedIn, savedTeams }) {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [savedKeys, setSavedKeys] = useState(
    new Set(savedTeams.map((t) => t.platform_league_id))
  );
  const [pending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  function handleLookup(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await lookupSleeperTeams(username);
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
      }
    });
  }

  function handleSave(e, team, sleeperUsername) {
    e.preventDefault();
    setSavingKey(team.league_id);
    startTransition(async () => {
      const res = await saveTeam({
        sleeperUsername,
        leagueId: team.league_id,
        leagueName: team.league_name,
        teamName: team.team_name,
        rosterId: team.roster_id,
        settings: team.settings,
        players: team.players,
      });
      setSavingKey(null);
      if (res.error) {
        setError(res.error);
      } else {
        setSavedKeys((prev) => new Set(prev).add(team.league_id));
      }
    });
  }

  function handleDelete(id) {
    setDeletingId(id);
    startTransition(async () => {
      await deleteTeam(id);
      setDeletingId(null);
    });
  }

  return (
    <div className="my-team-wrap">
      {savedTeams.length > 0 && (
        <div className="my-team-saved">
          <h2>Your Saved Teams</h2>
          {savedTeams.map((t) => (
            <details key={t.id} className="my-team-saved-card">
              <summary>
                <span className="my-team-chevron">▸</span>
                <div className="my-team-saved-title">
                  <div>
                    <span className="my-team-saved-name">{t.team_name || "Untitled Team"}</span>
                    <span className="my-team-saved-league">{t.league_name}</span>
                  </div>
                  <LeagueBadges settings={t.settings} />
                </div>
                <button
                  type="button"
                  className="my-team-remove"
                  disabled={pending && deletingId === t.id}
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(t.id);
                  }}
                >
                  {pending && deletingId === t.id ? "Removing…" : "Remove"}
                </button>
              </summary>
              <RosterTable players={t.players || []} />
            </details>
          ))}
        </div>
      )}

      <form className="my-team-lookup" onSubmit={handleLookup}>
        <label htmlFor="sleeper-username" className="my-team-label">
          Sleeper Username
        </label>
        <div className="my-team-lookup-row">
          <input
            id="sleeper-username"
            className="player-search-input"
            type="text"
            placeholder="e.g. yourusername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending && !result && !error ? "Looking Up…" : "Find My Teams"}
          </button>
        </div>
        <p className="my-team-hint">
          Reads directly from Sleeper&apos;s public API — no login to Sleeper needed.
        </p>
      </form>

      {error && <div className="my-team-error">{error}</div>}

      {result && (
        <div className="my-team-results">
          {result.teams.map((team) => {
            const isSaved = savedKeys.has(team.league_id);
            return (
              <details key={team.league_id} className="my-team-result-card reveal in">
                <summary className="my-team-result-head">
                  <div className="my-team-result-title">
                    <span className="my-team-chevron">▸</span>
                    <div>
                      <h3>{team.team_name}</h3>
                      <span className="my-team-result-league">{team.league_name}</span>
                      <LeagueBadges settings={team.settings} />
                    </div>
                  </div>
                  {isSignedIn ? (
                    <button
                      type="button"
                      className="round-btn primary my-team-save-btn"
                      disabled={pending || isSaved}
                      onClick={(e) => handleSave(e, team, result.sleeperUsername)}
                    >
                      {isSaved
                        ? "Saved ✓"
                        : pending && savingKey === team.league_id
                        ? "Saving…"
                        : "Save Team"}
                    </button>
                  ) : (
                    <a href="/login" className="round-btn outline my-team-save-btn">
                      Sign In To Save
                    </a>
                  )}
                </summary>
                <RosterTable players={team.players} />
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
