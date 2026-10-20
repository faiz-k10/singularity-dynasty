// Live play-by-play for the Sunday board's "Playing now" panel (app/my-team/SundayBoard.js): the recent plays that
// involved the players on the field right now -- yours and your opponents' -- newest first, in plain words
// ("Catch · 21 yds · from J. Love", "Touchdown run · 1 yd", "Sack" for a team defense).
//
// Source: ESPN's public (unofficial) core API, same family as lib/gameStatus.js. Its plays name each participant by
// ESPN athlete id and role (passer / receiver / rusher / kicker ...), so we match OUR players to ESPN athlete ids once
// through the team's ESPN roster (full name, then last name + position) instead of guessing from the play text --
// the text uses "J.Williams", which can be two players on one team. Sleeper's own espn_id covers only about a quarter
// of active players, so it isn't used. Anything that fails just returns no plays; the panel's player list is unaffected.
//
// The pure parts (parse, match, describe, build) are tested in test/playByPlay.test.mjs; the fetchers keep a small
// module cache: a game's plays for 20 seconds (refreshing only the newest page), a team roster for 12 hours.

const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

const idFrom = (ref, kind) => {
  const m = String(ref || "").match(new RegExp(`/${kind}/(\\d+)`));
  return m ? m[1] : null;
};

const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)\.?$/i;
export const normName = (s) => String(s || "").replace(SUFFIX, "").toLowerCase().replace(/[^a-z]/g, "");
const lastName = (s) => {
  const parts = String(s || "").replace(SUFFIX, "").trim().split(/\s+/);
  return normName(parts[parts.length - 1]);
};
// ESPN team roster -> [{ id, name, norm, last, pos }].
export function parseRoster(json) {
  const out = [];
  for (const g of json?.athletes || []) {
    for (const a of g.items || []) {
      const name = a.fullName || a.displayName;
      if (!a.id || !name) continue;
      out.push({ id: String(a.id), name, norm: normName(name), last: lastName(name), pos: a.position?.abbreviation || null });
    }
  }
  return out;
}

// Our player ({ name, pos }) -> his ESPN athlete id on that roster, or null when it isn't clear. Full name first
// (suffixes and punctuation ignored: "A.J. Brown", "Marvin Harrison Jr."), then a unique last name at his position
// (covers "Hollywood" / "Marquise" style differences between Sleeper and ESPN).
export function matchAthlete(player, roster) {
  const pos = player.pos === "K" ? "PK" : player.pos;
  const n = normName(player.name);
  let hits = roster.filter((a) => a.norm === n);
  if (hits.length > 1) hits = hits.filter((a) => a.pos === pos);
  if (hits.length === 1) return hits[0].id;
  const last = lastName(player.name);
  const byLast = roster.filter((a) => a.last === last && a.pos === pos);
  return byLast.length === 1 ? byLast[0].id : null;
}

// The yards the play itself gained, from the text ("for 11 yards", "for no gain"): ESPN's statYardage folds in
// penalty yards (an 11-yard catch with a 15-yard foul after it reads -19). Falls back to statYardage (field goals).
export function playYards(text, statYardage) {
  const m = String(text || "").match(/for (-?\d+) yards?|for no gain/i);
  if (m) return m[1] == null ? 0 : Number(m[1]);
  return typeof statYardage === "number" ? statYardage : null;
}

// ESPN core plays page items -> trimmed plays. codeById maps ESPN team ids to our team codes (from the scoreboard).
export function parsePlays(items, codeById = {}) {
  return (items || []).map((p) => {
    const offense = idFrom(p.start?.team?.$ref, "teams") || p.start?.team?.id || idFrom(p.team?.$ref, "teams");
    return {
      id: String(p.id),
      seq: Number(p.sequenceNumber) || 0,
      type: p.type?.text || "",
      text: p.text || "",
      period: p.period?.number ?? null,
      clock: p.clock?.displayValue ?? null,
      wall: p.wallclock || null,
      scoring: !!p.scoringPlay,
      offense: codeById[offense] || null,
      yards: playYards(p.text, p.statYardage),
      people: (p.participants || []).map((x) => ({ id: idFrom(x.athlete?.$ref, "athletes"), role: x.type })).filter((x) => x.id),
    };
  });
}

const INT = /Interception/;
const FUMBLE_LOST = /Fumble Recovery \(Opponent\)|Fumble Return Touchdown/;

// What one of our players did on a play, from his role(s) in it. Only plays that move fantasy points are kept --
// catches, runs, completions, scores, kicks, returns, turnovers -- so incompletions, sacks taken, recovered fumbles,
// blocks and tackles stay off (null) and the list reads as "what just changed my score". Yards are added separately.
export function roleLabel(type, roles, text = "") {
  const has = (r) => roles.includes(r);
  const td = /Touchdown/.test(type);
  if (type === "Penalty" || /No Play/i.test(text)) return null;
  if (has("receiver") && !has("passer")) {
    if (td && /Pass/.test(type)) return "Touchdown catch";
    if (/Reception/.test(type)) return "Catch";
  }
  if (has("passer")) {
    if (INT.test(type)) return "Interception thrown";
    if (td && /Pass/.test(type)) return "Touchdown pass";
    if (/Reception/.test(type)) return "Completion";
  }
  if (has("fumbler") && FUMBLE_LOST.test(type)) return "Fumble lost";
  if (has("rusher")) {
    if (td && /Rush/.test(type)) return "Touchdown run";
    if (type === "Rush") return "Run";
  }
  if (has("returner") && /Kickoff|Punt/.test(type)) return td ? "Return touchdown" : "Return";
  // After a touchdown: the two-point try's target is listed as "patScorer" (no kicker role) -- a failed try is no play.
  if (has("patScorer") && !has("kicker")) return /ATTEMPT FAIL/i.test(text) ? null : "Two-point conversion";
  if (has("kicker")) {
    if (/Field Goal Good/.test(type)) return "Field goal";
    if (/Field Goal/.test(type)) return "Missed field goal";
    if (td) return /no good|blocked|failed/i.test(text) ? "Missed extra point" : "Extra point";
  }
  if (has("scorer") && td) return "Touchdown";
  return null;
}

// A team defense (DEF) starter: the plays that score for it, when the other team has the ball.
export function defenseLabel(type) {
  if (/Sack/.test(type)) return "Sack";
  if (INT.test(type)) return /Touchdown/.test(type) ? "Interception touchdown" : "Interception";
  if (/Fumble Return Touchdown/.test(type)) return "Fumble return touchdown";
  if (/Fumble Recovery \(Opponent\)/.test(type)) return "Fumble recovery";
  if (/Safety/.test(type)) return "Safety";
  if (/Blocked/.test(type)) return "Blocked kick";
  return null;
}

const NO_YARDS = /intercept|fumble|extra point|two-point|missed|safety|blocked|^sack$/i;
export function yardsFor(label, yards) {
  if (yards == null || NO_YARDS.test(label)) return null;
  if (yards === 0) return label === "Field goal" ? null : "no gain";
  const n = Math.abs(yards);
  return `${yards < 0 ? "−" : ""}${n} ${n === 1 ? "yd" : "yds"}`;
}

// Fantasy points one play is worth to the player with this label: the site's fixed standard PPR rates (1 per catch, 0.1 per rushing /
// receiving yard, 0.04 per passing yard, 6 per touchdown run or catch, 4 per touchdown pass, -2 per interception thrown or
// fumble lost, 3 per field goal, 1 per extra point, 2 per two-point conversion; defense: 1 per sack, 2 per turnover or safety,
// 6 per score). A league's own scoring can differ a little, so this is "about"; kick-return yards and field-goal distance
// bonuses are not counted.
export function playPoints(label, yards) {
  const y = typeof yards === "number" ? yards : 0;
  switch (label) {
    case "Catch": return 1 + 0.1 * y;
    case "Touchdown catch": return 7 + 0.1 * y;
    case "Run": return 0.1 * y;
    case "Touchdown run": return 6 + 0.1 * y;
    case "Completion": return 0.04 * y;
    case "Touchdown pass": return 4 + 0.04 * y;
    case "Interception thrown":
    case "Fumble lost": return -2;
    case "Field goal": return 3;
    case "Extra point": return 1;
    case "Two-point conversion": return 2;
    case "Touchdown":
    case "Return touchdown": return 6;
    case "Sack": return 1;
    case "Interception":
    case "Fumble recovery":
    case "Safety":
    case "Blocked kick": return 2;
    case "Interception touchdown":
    case "Fumble return touchdown": return 8;
    default: return 0;
  }
}

// A play worth flagging in the list: a gain of BIG_YARDS or more by the offense (touchdowns are flagged separately by `td`).
export const BIG_YARDS = 20;
const BIG_PLAY = /^(Catch|Completion|Run|Return|Touchdown catch|Touchdown pass|Touchdown run)$/;

const ord = (n) => (n == null ? "" : n > 4 ? "OT" : ["1st", "2nd", "3rd", "4th"][n - 1]);

// players: [{ playerId, name, pos, team, side: "mine" | "theirs", espnId? }] -- the panel's rows, espnId resolved by
// matchAthlete. plays: parsed plays, each with `teams` (the two team codes in its game). Returns the newest `limit` plays that move a fantasy score (catches, runs, completions, scores, kicks, returns,
// turnovers -- see roleLabel) involving any of them, one entry per player per play (a pass is two entries: the passer's and the
// receiver's).
export function buildPlayFeed(players, plays, { limit = 80 } = {}) {
  return buildAllPlayEntries(players, plays).slice(0, limit);
}

// Every entry, newest first, no cap (the live panel's per-player running totals need a player's whole game).
export function buildAllPlayEntries(players, plays) {
  const byAthlete = new Map();
  const defenses = [];
  for (const p of players || []) {
    if (p.pos === "DEF") defenses.push(p);
    else if (p.espnId) byAthlete.set(p.espnId, [...(byAthlete.get(p.espnId) || []), p]);
  }
  const out = [];
  for (const play of plays || []) {
    if (play.type === "Penalty") continue;
    const roles = new Map();
    for (const x of play.people) roles.set(x.id, [...(roles.get(x.id) || []), x.role]);
    // One line per player (a player who is yours in one league and theirs in another is one line, side "both").
    const who = new Map();
    const add = (p, label, r = []) => {
      const w = who.get(p.playerId);
      if (w) w.side = w.side === p.side ? w.side : "both";
      else who.set(p.playerId, { playerId: p.playerId, name: p.name, pos: p.pos, team: p.team, side: p.side, label, roles: r });
    };
    for (const [aid, r] of roles) {
      for (const p of byAthlete.get(aid) || []) {
        const label = roleLabel(play.type, r, play.text);
        if (label) add(p, label, r);
      }
    }
    for (const d of defenses) {
      if (!play.teams?.includes(d.team) || !play.offense || play.offense === d.team) continue;
      const label = defenseLabel(play.type);
      if (label) add(d, label);
    }
    if (!who.size) continue;
    // One entry per player on the play (the passer and the receiver of one pass are two lines), passer first, then
    // receiver, then anyone else (a kicker's extra point on the same play). Each carries his own wording, yards and points.
    const rank = (w) => (w.roles.includes("passer") ? 0 : w.roles.includes("receiver") ? 1 : 2);
    const when = play.clock && play.period ? `${play.clock} - ${ord(play.period)}` : ord(play.period);
    for (const w of [...who.values()].sort((a, b) => rank(a) - rank(b))) {
      out.push({
        id: `${play.id}:${w.playerId}`,
        wall: play.wall,
        seq: play.seq,
        when,
        label: w.label,
        yards: yardsFor(w.label, play.yards),
        big: BIG_PLAY.test(w.label) && play.yards >= BIG_YARDS,
        // Standard-PPR points this play added for him.
        points: Math.round(playPoints(w.label, play.yards) * 10) / 10,
        exact: playPoints(w.label, play.yards), // unrounded, for matching Sleeper's two-decimal numbers
        td: play.scoring && /Touchdown|Interception touchdown|Fumble return touchdown|Return touchdown/.test(w.label),
        side: w.side,
        who: [{ playerId: w.playerId, name: w.name, pos: w.pos, team: w.team, side: w.side }],
      });
    }
  }
  out.sort((a, b) => String(b.wall || "").localeCompare(String(a.wall || "")) || b.seq - a.seq);
  return out;
}

// { playerId: [points of each of his plays, oldest first] } from the entries above, for the live panel's "plays Sleeper hasn't posted
// yet" estimate (lib/liveFeed.js pendingFor). Team defenses are left out: their scoring includes points allowed, which plays don't show.
export function playerPlayTotals(entries) {
  const out = {};
  for (const e of [...(entries || [])].reverse()) {
    const w = e.who?.[0];
    if (!w || w.pos === "DEF") continue;
    (out[w.playerId] ||= []).push(e.exact ?? e.points);
  }
  return out;
}

// ---- fetchers (server only) ----

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}

const PAGE = 50;
const games = new Map(); // eventId -> { plays: Map(id -> play), pages, at, pending, used }
// Every play of one game so far. The first call reads every page; later calls re-read only the newest page (plus any
// page added since), so a refresh costs one small request.
export async function fetchEventPlays(eventId, codeById) {
  let g = games.get(eventId);
  if (!g) {
    g = { plays: new Map(), pages: 0, at: 0, pending: null, used: 0 };
    games.set(eventId, g);
  }
  g.used = Date.now();
  if (Date.now() - g.at < 20 * 1000) return [...g.plays.values()];
  if (g.pending) return g.pending;
  g.pending = (async () => {
    try {
      const base = `${CORE}/events/${eventId}/competitions/${eventId}/plays?limit=${PAGE}`;
      const from = Math.max(1, g.pages);
      const first = await getJson(`${base}&page=${from}`);
      const more = [];
      for (let pg = from + 1; pg <= (first.pageCount || 1); pg++) more.push(getJson(`${base}&page=${pg}`));
      for (const j of [first, ...(await Promise.all(more))]) for (const p of parsePlays(j.items, codeById)) g.plays.set(p.id, p);
      g.pages = first.pageCount || 1;
      g.at = Date.now();
    } catch {
      // keep what we had
    } finally {
      g.pending = null;
    }
    // Forget games nobody has asked about for 8 hours.
    for (const [id, x] of games) if (Date.now() - x.used > 8 * 3600 * 1000) games.delete(id);
    return [...g.plays.values()];
  })();
  return g.pending;
}

const rosters = new Map(); // ESPN team id -> { list, at }
export async function fetchRoster(espnTeamId) {
  const r = rosters.get(espnTeamId);
  if (r && Date.now() - r.at < 12 * 3600 * 1000) return r.list;
  try {
    const list = parseRoster(await getJson(`${SITE}/teams/${espnTeamId}/roster`));
    rosters.set(espnTeamId, { list, at: Date.now() });
    return list;
  } catch {
    return r?.list || [];
  }
}

// The panel's players + the scoreboard (lib/gameStatus.js) -> the play feed. Only games in progress are read.
export async function loadLivePlays(players, gameStates, opts) {
  if (!gameStates) return { plays: [], totals: {} };
  const live = (players || []).filter((p) => gameStates[p.team]?.state === "in" && gameStates[p.team].eventId);
  if (!live.length) return { plays: [], totals: {} };
  const codeById = {};
  const teamsByEvent = {};
  for (const [code, g] of Object.entries(gameStates)) {
    if (g.espnId) codeById[g.espnId] = code;
    if (g.eventId) (teamsByEvent[g.eventId] ||= []).push(code);
  }
  const events = [...new Set(live.map((p) => gameStates[p.team].eventId))];
  const teams = [...new Set(live.filter((p) => p.pos !== "DEF").map((p) => p.team))];
  const [lists, rosterLists] = await Promise.all([
    Promise.all(events.map((ev) => fetchEventPlays(ev, codeById).then((ps) => ps.map((p) => ({ ...p, teams: teamsByEvent[ev] }))))),
    Promise.all(teams.map((t) => (gameStates[t].espnId ? fetchRoster(gameStates[t].espnId) : []))),
  ]);
  const rosterByTeam = Object.fromEntries(teams.map((t, i) => [t, rosterLists[i]]));
  const withIds = live.map((p) => (p.pos === "DEF" ? p : { ...p, espnId: matchAthlete(p, rosterByTeam[p.team] || []) }));
  const entries = buildAllPlayEntries(withIds, lists.flat());
  return { plays: entries.slice(0, opts?.limit ?? 80), totals: playerPlayTotals(entries) };
}
