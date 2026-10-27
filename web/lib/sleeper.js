// Thin wrapper around Sleeper's public, unauthenticated REST API
// (https://docs.sleeper.com) -- no API key, no OAuth, just GET requests.
// This is what makes Sleeper the easy first platform to support (Yahoo
// needs real OAuth, ESPN has no official API at all -- see the /my-team
// roadmap in CLAUDE.md).
import { unstable_cache } from "next/cache";
import { normalizePlayerName } from "./portfolio";
import { createPublicClient } from "./supabase/public";
import { fetchAllRows } from "./fetchAllRows";

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

// One league's own record (name, settings, previous_league_id for dynasty / keeper chains).
export async function fetchSleeperLeague(leagueId) {
  return sleeperGet(`/league/${leagueId}`);
}

// Completed and failed trades / waiver claims / free-agent moves for one week ("round"); week 1 also carries the preseason moves.
export async function fetchSleeperTransactions(leagueId, round) {
  const data = await sleeperGet(`/league/${leagueId}/transactions/${round}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchSleeperDrafts(leagueId) {
  const data = await sleeperGet(`/league/${leagueId}/drafts`);
  return Array.isArray(data) ? data : [];
}

export async function fetchSleeperDraftPicks(draftId) {
  const data = await sleeperGet(`/draft/${draftId}/picks`);
  return Array.isArray(data) ? data : [];
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
// Sleeper's most-added players over the last 24 hours ([{ player_id, count }]), for My Team's "Best available"
// panel. Cached 30 minutes in module memory -- it moves slowly and is the same for everyone.
export async function fetchSleeperState() {
  return (await sleeperGet(`/state/nfl`)) || {};
}

// The player list (names, positions, teams, bios, headshot links) used to be Sleeper's 16MB /players/nfl dictionary. It now comes
// from our own player_directory table (migration 0039; model/player_directory.R -> scripts/publish-player-directory.mjs, built from
// nflverse and keyed by the Sleeper id My Team's rosters use), so the only thing we read from Sleeper is a user's own leagues. Same
// shape as before, so every caller is unchanged: { [sleeperId]: { first_name, last_name, position, team, number, height, weight,
// age, birth_date, years_exp, college, status, headshot } }. A player missing from the directory (a deep practice-squad name the
// nflverse crosswalk doesn't have yet) is simply unknown to the site until the next weekly publish. Cached per server instance
// for 6 hours; the table is public read.
// Photos are Sleeper's own thumbnails by Sleeper id (the founder's decision, Oct 20 2026; the NFL's rights in the images are a question for
// the attorney, see CLAUDE.md).
const sleeperPhoto = (id) => `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`;

let cachedPlayers = null;
let cachedAt = 0;
const PLAYERS_CACHE_MS = 6 * 60 * 60 * 1000;

export async function getSleeperPlayers() {
  if (cachedPlayers && Date.now() - cachedAt < PLAYERS_CACHE_MS) {
    return cachedPlayers;
  }
  const rows = await fetchAllRows(
    createPublicClient(),
    "player_directory",
    "sleeper_id, first_name, last_name, position, team, number, height, weight, age, birth_date, years_exp, college, status",
    (q) => q.order("sleeper_id", { ascending: true })
  );
  const trimmed = {};
  for (const p of rows) {
    trimmed[p.sleeper_id] = {
      first_name: p.first_name,
      last_name: p.last_name,
      position: p.position,
      team: p.team,
      number: p.number ?? null,
      height: p.height ?? null,
      weight: p.weight ?? null,
      age: typeof p.age === "number" ? p.age : p.age != null ? Number(p.age) : null,
      birth_date: p.birth_date ?? null,
      years_exp: p.years_exp ?? null,
      college: p.college ?? null,
      status: p.status ?? null,
      headshot: p.position === "DEF" ? null : sleeperPhoto(p.sleeper_id),
    };
  }
  // A failed read (or an unpublished table) must not be remembered as "no players".
  if (!Object.keys(trimmed).length) throw new Error("Player directory unavailable");
  cachedPlayers = trimmed;
  cachedAt = Date.now();
  return cachedPlayers;
}

// Height/weight + the headshot link, keyed by normalized name +
// POSITION rather than name alone -- name collisions are real (confirmed
// live: Lamar Jackson the Ravens QB and Lamar Jackson a DB are both in
// Sleeper's dict), and a name-only key just has the second one processed
// silently overwrite the first. Position isn't a perfect disambiguator
// either (a name shared by two players at the same position would still
// collide), but it's the cheap fix for the actual collision found,
// without needing a real id crosswalk. Shared by redraft-rankings' and
// player-simulations' own expanded-row bio/headshot lookups so the
// name+pos normalization only lives in one place.
// Cached for a day in Next's shared data cache (the lookup below is ~1MB, under the cache's 2MB entry limit), NOT just in
// each server instance's memory: every Weekly Rankings / Player Sims / compare page awaits this, and a fresh instance (every
// deploy, scale-out or idle restart) used to download and parse Sleeper's whole 16MB player dictionary right in the page's
// critical path before it could answer. Now that happens once a day for everyone, in the background.
const cachedBiosByNamePos = unstable_cache(
  async () => {
    const dict = await getSleeperPlayers();
    const byNamePos = {};
    for (const [id, p] of Object.entries(dict)) {
      const name = normalizePlayerName(`${p.first_name || ""} ${p.last_name || ""}`);
      if (!name || !p.position) continue;
      byNamePos[`${name}|${p.position}`] = { sleeperId: id, headshot: p.headshot ?? null, height: p.height ?? null, weight: p.weight ?? null, yearsExp: p.years_exp ?? null, birthDate: p.birth_date ?? null };
    }
    if (!Object.keys(byNamePos).length) throw new Error("Sleeper player dictionary unavailable"); // never cache an empty answer
    return byNamePos;
  },
  ["sleeper-bios-by-name-pos-v5"],
  { revalidate: 86400 }
);

export async function getPlayerBiosByNamePos() {
  try {
    return await cachedBiosByNamePos();
  } catch {
    return {};
  }
}
