// How a player got onto a roster: "drafted", "traded" or "pickup" (a waiver claim or a free-agent add). Pure helpers over Sleeper's
// draft picks and transactions; the fetching and caching is lib/leagueAcquisition.js.
//
// An event is { t (ms), how, playerId, rosterId }. A player's answer is the LATEST event that put him on the roster, so a
// draftee who was dropped and picked back up reads "pickup", and one acquired in a trade reads "traded" even if he was drafted by
// someone else first. Commissioner moves are ignored (they say nothing about how the manager got him).

export const ACQUIRED_LABEL = { drafted: "Drafted", traded: "Traded", pickup: "Picked up" };

// Short codes for the "My players" lookup that is serialized into the tool pages.
export const ACQUIRED_CODE = { drafted: "D", traded: "T", pickup: "P" };
export const ACQUIRED_FROM_CODE = { D: "drafted", T: "traded", P: "pickup" };

const KIND = { trade: "traded", waiver: "pickup", free_agent: "pickup" };

export function transactionEvents(transactions) {
  const out = [];
  for (const tx of transactions || []) {
    const how = KIND[tx?.type];
    if (!how || tx.status !== "complete") continue;
    const t = tx.status_updated || tx.created || 0;
    for (const [playerId, rosterId] of Object.entries(tx.adds || {})) {
      out.push({ t, how, playerId: String(playerId), rosterId: Number(rosterId) });
    }
  }
  return out;
}

// A draft's picks all count as happening when it finished (or started, if it hasn't): any later move outranks them.
export function draftEvents(draft, picks) {
  const t = draft?.last_picked || draft?.start_time || 0;
  return (picks || [])
    .filter((p) => p?.player_id && p.roster_id != null)
    .map((p) => ({ t, how: "drafted", playerId: String(p.player_id), rosterId: Number(p.roster_id) }));
}

// { playerId: how } for the players this roster gained, latest event winning.
export function acquiredMap(events, rosterId) {
  const out = {};
  const at = {};
  for (const e of events || []) {
    if (e.rosterId !== Number(rosterId)) continue;
    if (at[e.playerId] === undefined || e.t >= at[e.playerId]) {
      at[e.playerId] = e.t;
      out[e.playerId] = e.how;
    }
  }
  return out;
}
