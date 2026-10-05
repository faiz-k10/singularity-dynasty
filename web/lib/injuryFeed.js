// Live injury/news feed from ESPN's public NFL injuries endpoint -- one
// request covers all 32 teams: injury status (Out / Doubtful / Questionable
// / Injured Reserve), body part, expected return date, and the latest
// analyst blurb (also present for healthy players with recent news).
// UNOFFICIAL: ESPN doesn't document or guarantee this endpoint, so every
// caller must treat a null return as "feed unavailable" and degrade
// quietly. Cached 2 minutes so many users polling cost ESPN one request.
import { normalizePlayerName } from "./portfolio";

const URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";

export const SEVERITY = { Active: 0, Questionable: 1, Doubtful: 2, Out: 3, "Injured Reserve": 3 };

export async function fetchInjuryFeed() {
  try {
    const res = await fetch(URL, { next: { revalidate: 120 } });
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
          comment: i.shortComment || null,
          date: i.date || null,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}
