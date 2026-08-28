// Thin wrapper around Sleeper's public, unauthenticated REST API
// (https://docs.sleeper.com) -- no API key, no OAuth, just GET requests.
// This is what makes Sleeper the easy first platform to support (Yahoo
// needs real OAuth, ESPN has no official API at all -- see the /my-team
// roadmap in CLAUDE.md).
const SLEEPER_BASE = "https://api.sleeper.app/v1";
// The ownership-research endpoint below lives outside /v1 for whatever
// reason on Sleeper's end -- confirmed by hand, not just assumed.
const SLEEPER_ROOT = "https://api.sleeper.app";

async function sleeperGet(path, root = SLEEPER_BASE) {
  const res = await fetch(`${root}${path}`, { cache: "no-store" });
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

// One week's head-to-head matchups for a league. Each entry is
// {roster_id, matchup_id, points, players, starters, ...} -- the two
// rosters sharing a matchup_id are playing each other that week (a roster
// on a bye is the only one with its matchup_id). Returns null, not an
// error, for a week Sleeper hasn't scheduled yet: during the
// offseason/preseason the upcoming season's matchups aren't posted, so
// callers must handle a null (no opponent to show yet).
export async function fetchSleeperMatchups(leagueId, week) {
  const data = await sleeperGet(`/league/${leagueId}/matchups/${week}`);
  return Array.isArray(data) && data.length ? data : null;
}

// Current NFL week/season-type, used to pick which week's ownership
// research data actually has real numbers in it (see below -- during
// preseason, only week 1's regular-season research is populated yet).
export async function fetchSleeperState() {
  return (await sleeperGet(`/state/nfl`)) || {};
}

// Platform-wide roster%/start% for every player, for one week -- real
// Sleeper research data (confirmed live: {"11533":{"owned":99.1,
// "started":98.0}, ...}), not something this codebase computes. Small
// (~30KB) unlike the player dictionary, so fetched fresh each lookup
// rather than cached. A week with no data yet (e.g. asking for regular
// season week 3 while still in preseason) returns null, not an error.
export async function fetchSleeperResearch(season, week) {
  const data = await sleeperGet(`/players/nfl/research/regular/${season}/${week}`, SLEEPER_ROOT);
  return data || {};
}

// Week 1 fantasy-point projections (rotowire-sourced, same as Sleeper's
// own app), filtered to the offense/kicker/DEF positions that actually
// carry a projection. Keyed by player_id so actions.js can look each
// roster player's own row up directly. All three scoring flavors are
// kept per player -- the right one (PPR/half/standard) depends on each
// league's own scoring settings, picked in actions.js, not here.
// ~2MB uncompressed, fetched fresh per lookup like fetchSleeperResearch
// (no unstable_cache -- see getSleeperPlayers's note on its 2MB
// per-entry ceiling), since this is a one-shot server-side fetch rather
// than something cached raw.
const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

export async function fetchSleeperProjections(season, week) {
  const params = PROJECTION_POSITIONS.map((p) => `position[]=${p}`).join("&");
  const data = await sleeperGet(
    `/projections/nfl/${season}/${week}?season_type=regular&${params}`,
    SLEEPER_ROOT
  );
  const byPlayerId = {};
  for (const entry of data || []) {
    if (entry?.player_id && entry.stats) {
      byPlayerId[entry.player_id] = {
        ppr: typeof entry.stats.pts_ppr === "number" ? entry.stats.pts_ppr : null,
        half: typeof entry.stats.pts_half_ppr === "number" ? entry.stats.pts_half_ppr : null,
        std: typeof entry.stats.pts_std === "number" ? entry.stats.pts_std : null,
      };
    }
  }
  return byPlayerId;
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
