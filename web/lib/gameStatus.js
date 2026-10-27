// Which NFL games have kicked off, from ESPN's public scoreboard (same unofficial ESPN API family as lib/injuryFeed.js,
// so a null return means "unknown" and callers degrade quietly). Used by My Team's live Points column: a player whose
// game hasn't started shows "—" instead of a misleading 0.0. Cached 30 seconds in module memory, matching the poll.
const URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

// ESPN and Sleeper spell Washington differently; compare on Sleeper's code. (Both use LAR for the Rams -- checked
// against Sleeper's player dictionary and ESPN's team list, Oct 2026.)
const ALIAS = { WSH: "WAS", JAC: "JAX" };
export const teamCode = (t) => (t ? ALIAS[t] || t : t);

// { TEAM: { state: "pre" | "in" | "post", detail, period, clock, start, eventId, espnId, home } } for every team in this
// week's scoreboard. period + clock (seconds left in the period) let lib/winChance.js tell how much of a live game is
// left; start is the kickoff time (ISO) for games not started yet; eventId + espnId (ESPN's game and team ids) are how
// lib/playByPlay.js finds a live game's plays and the team's roster.
export function parseScoreboard(json) {
  const out = {};
  for (const e of json?.events || []) {
    const c = e.competitions?.[0];
    const st = c?.status?.type;
    if (!c || !st) continue;
    const comps = c.competitors || [];
    const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
    for (const comp of comps) {
      const code = teamCode(comp.team?.abbreviation);
      if (code) {
        const other = comps.find((x) => x !== comp);
        out[code] = {
          // The game's running score: this team's points and the opponent's (null before kickoff / when ESPN doesn't give it).
          score: num(comp.score),
          opp: other ? teamCode(other.team?.abbreviation) : null,
          oppScore: other ? num(other.score) : null,
          state: st.state,
          detail: st.shortDetail || st.detail || null,
          period: typeof c.status.period === "number" ? c.status.period : null,
          clock: typeof c.status.clock === "number" ? c.status.clock : null,
          start: c.date || e.date || null,
          eventId: e.id || c.id || null,
          espnId: comp.team?.id || null,
          home: comp.homeAway === "home",
        };
      }
    }
  }
  return out;
}

let cached = null;
let cachedAt = 0;
let inflight = null; // callers that arrive while ESPN is being read wait for that one request instead of sending their own
export async function fetchGameStates() {
  // 10s while any game is on (the clock and live scores are polled every 15s), 30s otherwise.
  const live = cached && Object.values(cached).some((g) => g?.state === "in");
  if (cached && Date.now() - cachedAt < (live ? 10 : 30) * 1000) return cached;
  inflight ||= (async () => {
    try {
      const res = await fetch(URL, { cache: "no-store" });
      if (res.ok) {
        cached = parseScoreboard(await res.json());
        cachedAt = Date.now();
      }
    } catch {
      // keep the last good copy
    }
    return cached;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

// The Points cell for one player: null = not started / no game (shown as "—").
export function livePointsFor(player, playerPoints, gameStates) {
  if (!playerPoints || !gameStates) return { pts: null, state: null };
  const g = gameStates[teamCode(player.team)];
  if (!g || g.state === "pre") return { pts: null, state: g?.state || null };
  const v = playerPoints[player.player_id];
  return { pts: typeof v === "number" ? v : 0, state: g.state };
}
