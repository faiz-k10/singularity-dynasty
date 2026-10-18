// Thin wrapper around Sleeper's public, unauthenticated REST API
// (https://docs.sleeper.com) -- no API key, no OAuth, just GET requests.
// This is what makes Sleeper the easy first platform to support (Yahoo
// needs real OAuth, ESPN has no official API at all -- see the /my-team
// roadmap in CLAUDE.md).
import { normalizePlayerName } from "./portfolio";

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
// than the request failing outright. Only the fields actually used are
// kept -- name parts / position / team for the roster view, plus the
// basic demographics (jersey, height, weight, age, birth date,
// experience, college, status) the My Analysis player card shows --
// still a tiny fraction of every raw Sleeper field for every player.
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
      number: p.number ?? null,
      height: p.height ?? null,
      weight: p.weight ?? null,
      age: typeof p.age === "number" ? p.age : null,
      birth_date: p.birth_date ?? null,
      years_exp: typeof p.years_exp === "number" ? p.years_exp : null,
      college: p.college ?? null,
      status: p.status ?? null,
    };
  }
  cachedPlayers = trimmed;
  cachedAt = Date.now();
  return cachedPlayers;
}

// Height/weight + Sleeper's own headshot id, keyed by normalized name +
// POSITION rather than name alone -- name collisions are real (confirmed
// live: Lamar Jackson the Ravens QB and Lamar Jackson a DB are both in
// Sleeper's dict), and a name-only key just has the second one processed
// silently overwrite the first. Position isn't a perfect disambiguator
// either (a name shared by two players at the same position would still
// collide), but it's the cheap fix for the actual collision found,
// without needing a real id crosswalk. Shared by redraft-rankings' and
// player-simulations' own expanded-row bio/headshot lookups so the
// name+pos normalization only lives in one place.
export async function getPlayerBiosByNamePos() {
  const dict = await getSleeperPlayers().catch(() => ({}));
  const byNamePos = {};
  for (const [id, p] of Object.entries(dict)) {
    const name = normalizePlayerName(`${p.first_name || ""} ${p.last_name || ""}`);
    if (!name || !p.position) continue;
    byNamePos[`${name}|${p.position}`] = { sleeperId: id, height: p.height ?? null, weight: p.weight ?? null, yearsExp: p.years_exp ?? null };
  }
  return byNamePos;
}
