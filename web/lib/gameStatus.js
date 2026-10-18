// Which NFL games have kicked off, from ESPN's public scoreboard (same unofficial ESPN API family as lib/injuryFeed.js,
// so a null return means "unknown" and callers degrade quietly). Used by My Team's live Points column: a player whose
// game hasn't started shows "—" instead of a misleading 0.0. Cached 30 seconds in module memory, matching the poll.
const URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

// ESPN and Sleeper spell a few teams differently; compare on one code.
const ALIAS = { WSH: "WAS", LAR: "LA", JAC: "JAX" };
export const teamCode = (t) => (t ? ALIAS[t] || t : t);

// { TEAM: { state: "pre" | "in" | "post", detail } } for every team in this week's scoreboard.
export function parseScoreboard(json) {
  const out = {};
  for (const e of json?.events || []) {
    const c = e.competitions?.[0];
    const st = c?.status?.type;
    if (!c || !st) continue;
    for (const comp of c.competitors || []) {
      const code = teamCode(comp.team?.abbreviation);
      if (code) out[code] = { state: st.state, detail: st.shortDetail || st.detail || null };
    }
  }
  return out;
}

let cached = null;
let cachedAt = 0;
export async function fetchGameStates() {
  if (cached && Date.now() - cachedAt < 30 * 1000) return cached;
  try {
    const res = await fetch(URL, { cache: "no-store" });
    if (!res.ok) return cached;
    cached = parseScoreboard(await res.json());
    cachedAt = Date.now();
    return cached;
  } catch {
    return cached;
  }
}

// The Points cell for one player: null = not started / no game (shown as "—").
export function livePointsFor(player, playerPoints, gameStates) {
  if (!playerPoints || !gameStates) return { pts: null, state: null };
  const g = gameStates[teamCode(player.team)];
  if (!g || g.state === "pre") return { pts: null, state: g?.state || null };
  const v = playerPoints[player.player_id];
  return { pts: typeof v === "number" ? v : 0, state: g.state };
}
