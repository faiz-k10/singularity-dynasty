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

// One player's line from his team's box score, by name. ESPN's displayName is often the nickname our player list doesn't use (Kenny / Kenneth
// Gainwell, Josh / Joshua, Mike / Michael), so when the exact name isn't there, take the ONE athlete on that team whose last name matches and whose
// first name starts with the same two letters. Several candidates (or none) -> null rather than a guess.
const lastWord = (name) => String(name || "").replace(/[,.]?\s+(jr|sr|ii|iii|iv|v)\.?$/i, "").trim().split(/\s+/).pop();
// First names ESPN replaces with a nickname that shares no opening letters (the two-letter rule can't catch these): ESPN's name for the player.
const NICKNAMES = { andrew: ["drew"], marquise: ["hollywood"], william: ["bill", "will"], robert: ["bobby", "rob"], christopher: ["chris"], nathaniel: ["nate"], zachary: ["zach"] };
export function findLine(teamBox, name) {
  if (!teamBox) return null;
  const key = normName(name);
  if (teamBox[key]) return teamBox[key];
  const last = normName(lastWord(name));
  if (!last || key.length <= last.length) return null;
  const first = key.slice(0, key.length - last.length);
  for (const nick of NICKNAMES[first] || []) if (teamBox[nick + last]) return teamBox[nick + last];
  const first2 = key.slice(0, 2);
  const hits = Object.keys(teamBox).filter((k) => k.length > last.length && k.endsWith(last) && k.slice(0, 2) === first2);
  return hits.length === 1 ? teamBox[hits[0]] : null;
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
    out[`${p.team}|${normName(p.name)}`] = findLine(boxes[g?.eventId]?.[String(g?.espnId)], p.name);
  }
  return out;
}
