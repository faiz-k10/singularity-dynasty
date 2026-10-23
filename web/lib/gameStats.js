// A player's box-score line for ONE game, for the matchup lineup rows: click a score and his stats this game slide in
// (app/my-team/GameStats.js). Source: ESPN's game summary (the same unofficial ESPN API the scoreboard and plays already use), read once a
// game per few seconds for everyone who asks. Pure parsing + chip building are tested in test/gameStats.test.mjs.
import { normName } from "./playByPlay.js";

// ESPN's summary boxscore -> { [espnTeamId]: { [normalizedName]: { passing: { "C/ATT": "24/31", YDS: "321", ... }, rushing: {...}, receiving: {...} } } }
export function parseBoxscore(json) {
  const out = {};
  for (const t of json?.boxscore?.players || []) {
    const byName = (out[String(t.team?.id)] ||= {});
    for (const cat of t.statistics || []) {
      for (const a of cat.athletes || []) {
        const key = normName(a.athlete?.displayName);
        if (!key) continue;
        const line = (byName[key] ||= {});
        line[cat.name] = Object.fromEntries((cat.labels || []).map((label, i) => [label, a.stats?.[i]]));
      }
    }
  }
  return out;
}

// Which numbers to show for a position: [label, ESPN category, ESPN label]. A number the player has no line for is left out.
const CHIPS = {
  QB: [["C/ATT", "passing", "C/ATT"], ["Pass yds", "passing", "YDS"], ["Pass TD", "passing", "TD"], ["INT", "passing", "INT"], ["Carries", "rushing", "CAR"], ["Rush yds", "rushing", "YDS"], ["Rush TD", "rushing", "TD"]],
  RB: [["Carries", "rushing", "CAR"], ["Rush yds", "rushing", "YDS"], ["Rush TD", "rushing", "TD"], ["Rec", "receiving", "REC"], ["Targets", "receiving", "TGTS"], ["Rec yds", "receiving", "YDS"], ["Rec TD", "receiving", "TD"]],
  WR: [["Rec", "receiving", "REC"], ["Targets", "receiving", "TGTS"], ["Rec yds", "receiving", "YDS"], ["Rec TD", "receiving", "TD"], ["Long", "receiving", "LONG"], ["Carries", "rushing", "CAR"], ["Rush yds", "rushing", "YDS"]],
};
CHIPS.TE = CHIPS.WR;

export function statChips(pos, line) {
  return (CHIPS[pos] || []).map(([label, cat, key]) => ({ label, value: line?.[cat]?.[key] })).filter((c) => c.value != null && c.value !== "");
}

// ---- server only ----
const cache = new Map(); // eventId -> { at, value: Promise } -- the PROMISE is cached, so rows opened at the same moment share one ESPN request
const TTL_MS = 8 * 1000;
export function fetchBoxscore(eventId) {
  const hit = cache.get(eventId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`, { cache: "no-store" }).then(async (res) => {
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    return parseBoxscore(await res.json());
  });
  value.catch(() => cache.delete(eventId)); // a failure is not remembered
  cache.set(eventId, { at: Date.now(), value });
  return value;
}

// players: [{ name, team, pos }] (our team codes); gameStates: lib/gameStatus.js. -> { [`${team}|${normalizedName}`]: line | null }
export async function loadGameStats(players, gameStates) {
  const events = [...new Set(players.map((p) => gameStates?.[p.team]?.eventId).filter(Boolean))];
  const boxes = Object.fromEntries(await Promise.all(events.map(async (ev) => [ev, await fetchBoxscore(ev).catch(() => null)])));
  const out = {};
  for (const p of players) {
    const g = gameStates?.[p.team];
    out[`${p.team}|${normName(p.name)}`] = boxes[g?.eventId]?.[String(g?.espnId)]?.[normName(p.name)] || null;
  }
  return out;
}
