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
