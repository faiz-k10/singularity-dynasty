// How each player on a saved roster was acquired (Drafted / Traded / Picked up), read from the league's own Sleeper history:
// the draft's picks plus the season's completed trades, waiver claims and free-agent adds (lib/acquisition.js picks the
// latest move that put him on the roster). A dynasty or keeper league's earlier seasons are walked back (previous_league_id, up
// to four more) only for the players this season doesn't explain, following the same roster_id: it is the franchise and stays
// put when a manager leaves and another takes the team over (matching by owner lost every player who came before the current
// manager arrived -- most of the unexplained players on the founder's leagues). Heavy-ish (a call per week plus the draft), so it is cached
// per league in module memory -- the current season for 10 minutes, finished seasons for 6 hours -- and only the saved
// teams' full refresh and a save ask for it; the landing page box and the lookup preview never do.
import { fetchSleeperLeague, fetchSleeperTransactions, fetchSleeperDrafts, fetchSleeperDraftPicks } from "./sleeper";
import { acquiredMap, draftEvents, transactionEvents } from "./acquisition";

const cache = new Map();
const NOW_TTL = 10 * 60 * 1000;
const PAST_TTL = 6 * 60 * 60 * 1000;
const MAX_SEASONS = 5;

async function leagueEvents(leagueId, rounds, ttl) {
  const key = `${leagueId}:${rounds}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.events;
  const [drafts, ...weeks] = await Promise.all([
    fetchSleeperDrafts(leagueId),
    ...Array.from({ length: rounds }, (_, i) => fetchSleeperTransactions(leagueId, i + 1)),
  ]);
  const picks = await Promise.all(drafts.filter((d) => d.status === "complete" || d.last_picked).map((d) => fetchSleeperDraftPicks(d.draft_id).then((p) => draftEvents(d, p))));
  const events = [...picks.flat(), ...weeks.flatMap(transactionEvents)];
  cache.set(key, { at: Date.now(), events });
  return events;
}

// league: Sleeper's league object; rosterId: the saved roster; playerIds: the players to explain.
// Returns { [playerId]: "drafted" | "traded" | "pickup" } for those it could explain.
export async function getAcquisitions({ league, rosterId, playerIds }) {
  const wanted = new Set((playerIds || []).map(String));
  const out = {};
  let cur = league;
  for (let depth = 0; cur && depth < MAX_SEASONS; depth++) {
    const current = depth === 0;
    const leg = Number(cur.settings?.leg) || 1;
    const events = await leagueEvents(cur.league_id, current ? Math.min(18, Math.max(1, leg)) : 18, current ? NOW_TTL : PAST_TTL);
    const found = acquiredMap(events, rosterId);
    for (const id of wanted) if (!out[id] && found[id]) out[id] = found[id];
    // Redraft leagues start fresh every year, so there is nothing earlier to find; stop once everyone is explained.
    if (cur.settings?.type === 0 || [...wanted].every((id) => out[id])) break;
    const prev = cur.previous_league_id;
    cur = prev && prev !== "0" ? await fetchSleeperLeague(prev) : null;
  }
  return out;
}
