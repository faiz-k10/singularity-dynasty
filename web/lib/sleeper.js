// Thin wrapper around Sleeper's public, unauthenticated REST API
// (https://docs.sleeper.com) -- no API key, no OAuth, just GET requests.
// This is what makes Sleeper the easy first platform to support (Yahoo
// needs real OAuth, ESPN has no official API at all -- see the /my-team
// roadmap in CLAUDE.md).
import { unstable_cache } from "next/cache";

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

// The full NFL player dictionary (~5,000 players, several MB) -- Sleeper's
// own docs ask integrators not to hit this more than once a day since it
// barely changes, so it's cached here for 24h rather than fetched fresh
// per request (same unstable_cache pattern player-simulations/page.js
// already uses for its own once-a-week data).
export const getSleeperPlayers = unstable_cache(
  async () => {
    const data = await sleeperGet(`/players/nfl`);
    return data || {};
  },
  ["sleeper-players-dictionary"],
  { revalidate: 86400 }
);
