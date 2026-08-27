// Thin wrapper around Sleeper's public, unauthenticated REST API
// (https://docs.sleeper.com) -- no API key, no OAuth, just GET requests.
// This is what makes Sleeper the easy first platform to support (Yahoo
// needs real OAuth, ESPN has no official API at all -- see the /my-team
// roadmap in CLAUDE.md).
const SLEEPER_BASE = "https://api.sleeper.app/v1";

async function sleeperGet(path) {
  const res = await fetch(`${SLEEPER_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchSleeperUser(username) {
  const data = await sleeperGet(`/user/${encodeURIComponent(username)}`);
  return data && data.user_id ? data : null;
}

export async function fetchSleeperLeagues(sleeperUserId, season) {
  const data = await sleeperGet(`/user/${sleeperUserId}/leagues/nfl/${season}`);
  return data || [];
}

export async function fetchSleeperRosters(leagueId) {
  const data = await sleeperGet(`/league/${leagueId}/rosters`);
  return data || [];
}

export async function fetchSleeperLeagueUsers(leagueId) {
  const data = await sleeperGet(`/league/${leagueId}/users`);
  return data || [];
}

// The full NFL player dictionary is ~16MB of raw JSON (thousands of
// players, every field Sleeper tracks per player) -- Sleeper's own docs
// ask integrators not to hit this more than once a day since it barely
// changes, so it's cached rather than fetched fresh per request. Can't
// use unstable_cache for this one like the rest of the codebase does
// (e.g. player-simulations/page.js) -- Next's data cache hard-rejects
// any single entry over 2MB, which this blows past by 8x even before
// trimming. A plain module-level cache has no such ceiling, at the cost
// of being per-server-instance rather than shared/persistent -- a cold
// serverless instance just re-fetches once, which is still far better
// than the request failing outright. Only the 4 fields actually used
// (name parts, position, team) are kept, cutting the in-memory size
// substantially versus holding every raw Sleeper field for every player.
let cachedPlayers = null;
let cachedAt = 0;
const PLAYERS_CACHE_MS = 24 * 60 * 60 * 1000;

export async function getSleeperPlayers() {
  if (cachedPlayers && Date.now() - cachedAt < PLAYERS_CACHE_MS) {
    return cachedPlayers;
  }
  const data = await sleeperGet(`/players/nfl`);
  const trimmed = {};
  for (const [id, p] of Object.entries(data || {})) {
    trimmed[id] = {
      first_name: p.first_name,
      last_name: p.last_name,
      position: p.position,
      team: p.team,
    };
  }
  cachedPlayers = trimmed;
  cachedAt = Date.now();
  return cachedPlayers;
}
