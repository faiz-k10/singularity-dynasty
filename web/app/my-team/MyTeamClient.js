"use client";

import { useState, useTransition } from "react";
import { lookupSleeperTeams, saveTeam, deleteTeam } from "./actions";
import TeamBadge from "../tools/TeamBadge";

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

// League format at a glance -- teams / QB format / scoring / TE premium,
// straight from Sleeper's own league object (see actions.js). TE premium
// only renders when the league actually has one; not every league does.
function LeagueBadges({ settings }) {
  if (!settings || !settings.teams) return null;
  return (
    <div className="my-team-settings">
      <span className="my-team-setting-pill">{settings.teams} Teams</span>
      <span className="my-team-setting-pill">{settings.qbFormat}</span>
      <span className="my-team-setting-pill">{settings.scoring}</span>
      {settings.tePremium && (
        <span className="my-team-setting-pill">{settings.tePremium}</span>
      )}
    </div>
  );
}

function sortPlayers(players) {
  return [...players].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a.position);
    const bi = POSITION_ORDER.indexOf(b.position);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi || a.name.localeCompare(b.name);
  });
}

function RosterTable({ players }) {
  const sorted = sortPlayers(players);
  return (
    <div className="rankings-table-wrap">
      <table className="rankings-table">
        <thead>
          <tr>
            <th className="align-left">Player</th>
            <th>Pos</th>
            <th>Team</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.player_id} data-pos={p.position || undefined}>
              <td className="player-cell align-left">{p.name}</td>
              <td className="mono">{p.position || "—"}</td>
              <td><TeamBadge team={p.team} /></td>
            </tr>
          ))}
        </tbody>
      </table>
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
