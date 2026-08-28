"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
      {settings.starters != null && (
        <span className="my-team-setting-pill pill-white">Start {settings.starters}</span>
      )}
      <span className="my-team-setting-pill pill-qb">{settings.qbFormat}</span>
      <span className="my-team-setting-pill pill-scoring">{settings.scoring}</span>
      {settings.tePremium && (
        <span className="my-team-setting-pill pill-te">{settings.tePremium}</span>
      )}
    </div>
  );
}

// This week's game -- "Week N" always (once the season/week is known),
// the opponent (with record) or a BYE tag, and the projected score
// (our Singularity projection over each side's starters) when we have
// one. Rendered on its own line under the league name; stays hidden
// entirely before Sleeper posts a week/matchups (offseason lookups
// just won't carry settings.week).
function MatchupLine({ settings }) {
  if (!settings || settings.week == null) return null;
  const proj = settings.matchupProj;
  const favored = proj ? proj.mine - proj.opp : 0;
  return (
    <span className="my-team-matchup">
      Week {settings.week}
      {settings.isBye ? (
        <> · BYE</>
      ) : settings.opponent ? (
        <>
          {" · vs "}
          <span className="my-team-matchup-opp">{settings.opponent}</span>
          {settings.opponentRecord ? ` (${settings.opponentRecord})` : ""}
          {proj && (
            <>
              {" · proj "}
              <span
                className={
                  favored > 0
                    ? "my-team-matchup-proj up"
                    : favored < 0
                    ? "my-team-matchup-proj down"
                    : "my-team-matchup-proj"
                }
              >
                {proj.mine.toFixed(1)}&ndash;{proj.opp.toFixed(1)}
              </span>
            </>
          )}
        </>
      ) : null}
    </span>
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

function formatPts(v) {
  return v === null || v === undefined ? "—" : v.toFixed(1);
}

function formatDiff(v) {
  if (v === null || v === undefined) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

// Same good/bad/heat shape as MatchupBadge's matchupTint, reusing the
// site's existing .matchup-cell heat-tint classes -- green the more our
// model is above Sleeper's, red the more it's below, capped at a 5-point
// spread (roughly a full tier of fantasy scoring) so one huge outlier
// doesn't wash out every other row's tint.
function diffTint(diff) {
  if (diff === null || diff === undefined) return null;
  const heat = Math.min(Math.abs(diff) / 5, 1);
  const cls = diff > 0 ? "good" : diff < 0 ? "bad" : "neutral";
  return { cls, heat };
}

const ROSTER_COLUMN_TYPES = {
  slot: "string",
  name: "string",
  position: "string",
  team: "string",
  myProjPts: "number",
  sleeperProjPts: "number",
  diffProj: "number",
  startPct: "number",
  rosterPct: "number",
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
              {view === "starters" && <Th label="Slot" sortKeyName="slot" {...thProps} />}
              <Th label="Player" sortKeyName="name" className="align-left" {...thProps} />
              <Th label="Pos" sortKeyName="position" {...thProps} />
              <Th label="Team" sortKeyName="team" {...thProps} />
              <Th label="Singularity Proj" sortKeyName="myProjPts" {...thProps} />
              <Th label="Sleeper Proj" sortKeyName="sleeperProjPts" {...thProps} />
              <Th label="Diff" sortKeyName="diffProj" {...thProps} />
              {view === "full" && <Th label="Start %" sortKeyName="startPct" {...thProps} />}
              {view === "full" && <Th label="Roster %" sortKeyName="rosterPct" {...thProps} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const tint = diffTint(p.diffProj);
              return (
                <tr
                  key={p.player_id}
                  // The position-color stripe duplicates SlotBadge's own
                  // outline color once Slot is the leading column in the
                  // starting lineup view, so it's only drawn in Full
                  // Roster (where there's no Slot badge doing that job).
                  data-pos={view === "starters" ? undefined : p.position || undefined}
                >
                  {view === "starters" && <td><SlotBadge slot={p.slot} /></td>}
                  <td className="player-cell align-left">{p.name}</td>
                  <td><PositionBadge position={p.position} /></td>
                  <td><TeamBadge team={p.team} /></td>
                  <td className="mono">{formatPts(p.myProjPts)}</td>
                  <td className="mono">{formatPts(p.sleeperProjPts)}</td>
                  <td
                    className={`mono${tint ? ` matchup-cell ${tint.cls}` : ""}`}
                    style={tint ? { "--heat": tint.heat } : undefined}
                  >
                    {formatDiff(p.diffProj)}
                  </td>
                  {view === "full" && <td className="mono">{formatPct(p.startPct)}</td>}
                  {view === "full" && <td className="mono">{formatPct(p.rosterPct)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// isSignedIn gates the Save button only -- the lookup itself works
// signed out too (it's a read-only call against Sleeper's public API, no
// Supabase involved), so a visitor can preview their team before ever
// creating an account. tier + savedTeamLimit (null = unlimited) drive
// the "N of M saved" indicator and the swap to an upgrade prompt once a
// free user is at their cap (the server action + DB trigger enforce it
// for real).
export default function MyTeamClient({ isSignedIn, tier, savedTeamLimit, savedTeams }) {
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

  const savedCount = savedKeys.size;
  const atLimit = savedTeamLimit != null && savedCount >= savedTeamLimit;

  return (
    <div className="my-team-wrap">
      {savedTeams.length > 0 && (
        <div className="my-team-saved">
          <div className="my-team-saved-head">
            <h2>Your Saved Teams</h2>
            {isSignedIn && savedTeamLimit != null && (
              <span className="my-team-saved-count">
                {savedCount} of {savedTeamLimit} saved
                {atLimit && (
                  <>
                    {" · "}
                    <Link href="/#pricing">upgrade for more</Link>
                  </>
                )}
              </span>
            )}
          </div>
          {savedTeams.map((t) => (
            <details key={t.id} className="my-team-saved-card">
              <summary>
                <span className="my-team-chevron">▸</span>
                <div className="my-team-saved-title">
                  <div>
                    <span className="my-team-saved-name">{t.team_name || "Untitled Team"}</span>
                    {t.settings?.record && (
                      <span className="my-team-record">{t.settings.record}</span>
                    )}
                    <span className="my-team-saved-league">{t.league_name}</span>
                    <MatchupLine settings={t.settings} />
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
                      <h3>
                        {team.team_name}
                        {team.settings?.record && (
                          <span className="my-team-record">{team.settings.record}</span>
                        )}
                      </h3>
                      <span className="my-team-result-league">{team.league_name}</span>
                      <MatchupLine settings={team.settings} />
                      <LeagueBadges settings={team.settings} />
                    </div>
                  </div>
                  {!isSignedIn ? (
                    <a href="/login" className="round-btn outline my-team-save-btn">
                      Sign In To Save
                    </a>
                  ) : !isSaved && atLimit ? (
                    <Link href="/#pricing" className="round-btn outline my-team-save-btn">
                      Upgrade To Save
                    </Link>
                  ) : (
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
