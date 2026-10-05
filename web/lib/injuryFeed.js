// Live injury/news feed from ESPN's public NFL injuries endpoint -- one
// request covers all 32 teams: injury status (Out / Doubtful / Questionable
// / Injured Reserve), body part, expected return date, and the latest
// analyst blurb (also present for healthy players with recent news).
// UNOFFICIAL: ESPN doesn't document or guarantee this endpoint, so every
// caller must treat a null return as "feed unavailable" and degrade
// quietly. Cached 2 minutes in memory (see below).
import { normalizePlayerName } from "./portfolio";

const URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";

export const SEVERITY = { Active: 0, Questionable: 1, Doubtful: 2, Out: 3, "Injured Reserve": 3 };

// The raw response is ~12MB (long analyst write-ups for every player),
// far over Next's 2MB fetch-cache limit, so `next: {revalidate}` can't cache
// it. Cache the small trimmed result in module memory instead (same
// approach as getSleeperPlayers in lib/sleeper.js): one upstream download
// per server instance per 2 minutes, however many users poll.
let cached = null;
let cachedAt = 0;
const FEED_CACHE_MS = 2 * 60 * 1000;

export async function fetchInjuryFeed() {
  if (cached && Date.now() - cachedAt < FEED_CACHE_MS) return cached;
  try {
    const res = await fetch(URL, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const out = [];
    for (const team of json.injuries || []) {
      for (const i of team.injuries || []) {
        const a = i.athlete || {};
        const name = a.displayName || `${a.firstName || ""} ${a.lastName || ""}`.trim();
        if (!name) continue;
        out.push({
          name,
          norm: normalizePlayerName(name),
          position: a.position?.abbreviation || null,
          status: i.status || "Active",
          severity: SEVERITY[i.status] ?? 0,
          detail: i.details?.type || null,
          returnDate: i.details?.returnDate || null,
          comment: i.shortComment || null, // longComment deliberately dropped (size)
          date: i.date || null,
        });
      }
    }
    cached = out;
    cachedAt = Date.now();
    return out;
  } catch {
    return cached; // stale beats nothing if ESPN hiccups
  }
}

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD

export function etDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : ET_DAY.format(d);
}

// The (Eastern-time) calendar days this NFL week has games on, from ESPN's
// scoreboard. Used so lineup alerts only fire for injuries reported ON a
// game day (in-game / game-day news), not midweek practice-report noise.
// Falls back to a Thu/Sun/Mon check if the scoreboard is unreachable.
export async function fetchGameDays() {
  try {
    const res = await fetch(SCOREBOARD, { next: { revalidate: 600 } });
    if (!res.ok) return null;
    const json = await res.json();
    const days = new Set();
    for (const ev of json.events || []) {
      const d = etDay(ev.date);
      if (d) days.add(d);
    }
    return days.size ? days : null;
  } catch {
    return null;
  }
}

export function isGameDay(iso, gameDays) {
  const day = etDay(iso);
  if (!day) return false;
  if (gameDays) return gameDays.has(day);
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 Sun, 1 Mon, 4 Thu
  return dow === 0 || dow === 1 || dow === 4;
}
