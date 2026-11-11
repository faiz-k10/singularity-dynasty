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

// Every Sleeper read goes through a small shared cache (Nov 10 2026, scaling check): the live poll asks for each league's matchups, rosters and
// users every 15-30s for every signed-in member, and Sleeper asks apps to stay under 1,000 calls a minute -- 50 members watching 5 leagues
// each on a Sunday was ~3,000. Each kind of read is kept for as long as its data can sensibly be stale (`ttl`, ms): matchups (live points)
// 20s, rosters 5 min, league members 30 min, and so on. Callers asking for the same thing at the same moment share ONE request. Failed reads
// (null) are never kept. Per server instance; `fresh` skips the cache for a read that must be current (saving a team, the waiver wire).
const SLEEPER_TTL = { matchups: 20e3, rosters: 300e3, users: 1800e3, state: 300e3, leagues: 300e3, user: 3600e3, league: 600e3, other: 600e3 };
const sleeperCache = new Map(); // path -> { at, ttl, value } or { pending }
const SLEEPER_CACHE_MAX = 4000;

// Data that can no longer change -- a finished week's scores, a past week's transactions, a completed draft's picks, a future week's schedule -- is
// kept in Next's SHARED data cache for 6 hours instead (every server instance reads one copy), because a cold full refresh of a dynasty league
// asks for dozens of these and each instance used to fetch them all again.
const sharedSleeperGet = unstable_cache(
  async (path) => {
    const res = await fetch(`${SLEEPER_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Sleeper ${res.status}`); // thrown, so a failure is never cached
    return res.json();
  },
  ["sleeper-final-v1"],
  { revalidate: 21600 }
);

async function sleeperGet(path, kind = "other", { fresh = false, final = false } = {}) {
  if (final && !fresh) {
    try {
      return await sharedSleeperGet(path);
    } catch {
      // fall through to a plain read
    }
  }
  const now = Date.now();
  const hit = sleeperCache.get(path);
  if (!fresh && hit) {
    if (hit.pending) return hit.pending;
    if (now - hit.at < hit.ttl) return hit.value;
  }
  const pending = fetch(`${SLEEPER_BASE}${path}`, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((value) => {
      if (value == null) sleeperCache.delete(path);
      else {
        sleeperCache.delete(path); // re-insert so the Map's order is oldest-first for trimming
        sleeperCache.set(path, { at: Date.now(), ttl: SLEEPER_TTL[kind] ?? SLEEPER_TTL.other, value });
        if (sleeperCache.size > SLEEPER_CACHE_MAX) sleeperCache.delete(sleeperCache.keys().next().value);
      }
      return value;
    });
  sleeperCache.set(path, { pending });
  return pending;
}

export async function fetchSleeperUser(username) {
  const data = await sleeperGet(`/user/${encodeURIComponent(username)}`, "user");
  return data && data.user_id ? data : null;
}

// One league's own record (name, settings, previous_league_id for dynasty / keeper chains).
export async function fetchSleeperLeague(leagueId) {
  return sleeperGet(`/league/${leagueId}`, "league");
}

// Completed and failed trades / waiver claims / free-agent moves for one week ("round"); week 1 also carries the preseason moves.
export async function fetchSleeperTransactions(leagueId, round, opts) {
  const data = await sleeperGet(`/league/${leagueId}/transactions/${round}`, "other", opts);
  return Array.isArray(data) ? data : [];
}

export async function fetchSleeperDrafts(leagueId) {
  const data = await sleeperGet(`/league/${leagueId}/drafts`);
  return Array.isArray(data) ? data : [];
}

export async function fetchSleeperDraftPicks(draftId, opts) {
  const data = await sleeperGet(`/draft/${draftId}/picks`, "other", opts);
  return Array.isArray(data) ? data : [];
}

export async function fetchSleeperLeagues(sleeperUserId, season) {
  const data = await sleeperGet(`/user/${sleeperUserId}/leagues/nfl/${season}`, "leagues");
  return data || [];
}

export async function fetchSleeperRosters(leagueId, opts) {
  const data = await sleeperGet(`/league/${leagueId}/rosters`, "rosters", opts);
  return data || [];
}

export async function fetchSleeperLeagueUsers(leagueId) {
  const data = await sleeperGet(`/league/${leagueId}/users`, "users");
  return data || [];
}

// One week's head-to-head matchups for a league. Each entry is
// {roster_id, matchup_id, points, players, starters, ...} -- the two
// rosters sharing a matchup_id are playing each other that week (a roster
// on a bye is the only one with its matchup_id). Returns null, not an
// error, for a week Sleeper hasn't scheduled yet: during the
// offseason/preseason the upcoming season's matchups aren't posted, so
// callers must handle a null (no opponent to show yet).
export async function fetchSleeperMatchups(leagueId, week, opts) {
  const data = await sleeperGet(`/league/${leagueId}/matchups/${week}`, "matchups", opts);
  return Array.isArray(data) && data.length ? data : null;
}

// Current NFL week/season-type, used to pick which week's ownership
// research data actually has real numbers in it (see below -- during
// preseason, only week 1's regular-season research is populated yet).
// Sleeper's most-added players over the last 24 hours ([{ player_id, count }]), for My Team's "Best available"
// panel. Cached 30 minutes in module memory -- it moves slowly and is the same for everyone.
export async function fetchSleeperState() {
  return (await sleeperGet(`/state/nfl`, "state")) || {};
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
  ["sleeper-bios-by-name-pos-v6"],
  { revalidate: 86400 }
);

export async function getPlayerBiosByNamePos() {
  try {
    return await cachedBiosByNamePos();
  } catch {
    return {};
  }
}
