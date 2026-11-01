// The Sunday board's live panel and its game-day check (app/my-team/SundayBoard.js). Pure, no imports;
// tested in test/liveFeed.test.mjs.
//
// Only players ON THE FIELD RIGHT NOW (game in progress) -- yours and your opponents' -- across every saved league, or
// just one league when its matchup is open (onlyTeamId). Finished and not-started players are left out on purpose: the
// panel is for "who is playing for / against me at this moment", and finals made it noisy. From each league's
// head-to-head lineups (settings.h2h.mine / .opp, refreshed by the 30-second poll). A player who starts for you in 3
// leagues is one row with 3 starts; one who starts for you in one league and against you in another gets a row on
// each side. Each side's total adds every start's points in that league's own scoring.

// gameStates: lib/gameStatus.js parseScoreboard() output.
import { leagueName, round2 as r2 } from "./format.js";
import { scorePlay } from "./playScoring.js";

// "PHI 14–10": the game's score with the player's own team first (null before the score exists).
export function gameScoreLabel(team, g) {
  return Number.isFinite(g?.score) && Number.isFinite(g?.oppScore) ? `${team} ${g.score}–${g.oppScore}${g.opp ? ` vs ${g.opp}` : ""}` : null;
}

export function buildLiveFeed(savedTeams, gameStates, { onlyTeamId = null } = {}) {
  const empty = { mine: [], theirs: [], mineTotal: 0, theirsTotal: 0, nextStart: null, nextUp: null, anyLeft: false };
  if (!gameStates) return empty;
  const sides = { mine: new Map(), theirs: new Map() };
  let nextStart = null;
  const waiting = []; // starters whose game hasn't kicked off: { side, id, team, start }
  for (const t of savedTeams || []) {
    const s = t.settings || {};
    if (s.isBye) continue;
    if (onlyTeamId != null && t.id !== onlyTeamId) continue;
    const league = leagueName(t, "League");
    for (const [side, list] of [["mine", s.h2h?.mine], ["theirs", s.h2h?.opp]]) {
      for (const p of list || []) {
        if (!p.id || !p.team) continue;
        const g = gameStates[p.team];
        if (!g) continue;
        if (g.state === "pre" && g.start) {
          if (!nextStart || g.start < nextStart) nextStart = g.start;
          waiting.push({ side, id: p.id, team: p.team, start: g.start });
        }
        if (g.state !== "in") continue;
        const pts = typeof p.pts === "number" ? p.pts : 0;
        let row = sides[side].get(p.id);
        if (!row) {
          row = { id: `${side}:${p.id}`, playerId: p.id, side, name: p.name, pos: p.pos, team: p.team, proj: p.proj, est: !!p.est, detail: g.detail || null, game: gameScoreLabel(p.team, g), starts: [] };
          sides[side].set(p.id, row);
        }
        row.starts.push({ teamId: t.id, league, opponent: side === "theirs" ? s.opponent || null : null, pts, scoring: s.scoringSettings || null, pos: p.pos });
      }
    }
  }
  const finish = (m) =>
    [...m.values()].map((r) => {
      const all = r.starts.map((x) => x.pts);
      return { ...r, pts: Math.max(...all), ptsMin: Math.min(...all), total: Math.round(all.reduce((a, b) => a + b, 0) * 100) / 100 };
    });
  const mine = finish(sides.mine);
  const theirs = finish(sides.theirs);
  const sum = (rows) => Math.round(rows.reduce((a, r) => a + r.total, 0) * 10) / 10;
  // The panel's between-games card: the games at the next kickoff (team pairs from ESPN's event id, away team first) and how many of
  // your / your opponents' starters play in them.
  let nextUp = null;
  if (nextStart) {
    const at = waiting.filter((w) => w.start === nextStart);
    const games = new Map();
    for (const w of at) {
      const ev = gameStates[w.team]?.eventId || w.team;
      if (!games.has(ev)) games.set(ev, Object.keys(gameStates).filter((t) => gameStates[t].eventId && gameStates[t].eventId === ev).sort((a, b) => Number(!!gameStates[a].home) - Number(!!gameStates[b].home) || a.localeCompare(b)));
      if (!games.get(ev).length) games.set(ev, [w.team]);
    }
    const count = (side) => new Set(at.filter((w) => w.side === side).map((w) => w.id)).size;
    nextUp = { games: [...games.values()], mine: count("mine"), theirs: count("theirs") };
  }
  return { mine, theirs, mineTotal: sum(mine), theirsTotal: sum(theirs), nextStart, nextUp, anyLeft: waiting.length > 0 };
}

// Sleeper posts a player's points about a minute and a half after the play; ESPN's play list is ~25 seconds behind. So the panel adds
// the plays Sleeper hasn't counted yet: `plays` is his plays oldest first (lib/playByPlay.js playerPlayTotals: { l: label, y: yards }),
// scored here in EACH LEAGUE'S OWN scoring (lib/playScoring.js: Sleeper's number is in the league's scoring, a league that pays 0.25 a
// carry drifts from a standard-PPR running total on the first play). If Sleeper's number in every league he starts in equals the running
// total after some play k, the plays after k are the pending ones -- per league, since the same plays are worth different amounts in
// different scoring. If any league's number matches no point of its running total (a yardage bonus, a play we don't list) we say
// nothing rather than guess. (A plain number in `plays` is a play already scored, for tests and standard scoring.)
const PEND_TOL = 0.02; // Sleeper posts exact two-decimal points (a 6-yard pass is 0.24)
// The play list takes its yardage from ESPN's play text, which can differ from the official stat by a yard or two (Swift's Sleeper 0.70 sat
// between our running totals 0.60 and 1.60: a one-yard difference), so when no running total matches exactly the nearest one within this
// distance (about three yards of rushing / receiving) is taken instead of giving up and leaving the score on Sleeper's older number.
const NEAR_TOL = 0.35;
// The index into `prefix` (running totals, prefix[0] = 0) that Sleeper's number `pts` has counted up to, or -1 when nothing is close.
function matchedPrefix(prefix, pts) {
  let exact = -1;
  let near = -1;
  let nearDiff = Infinity;
  prefix.forEach((sum, k) => {
    const d = Math.abs(sum - pts);
    if (d < PEND_TOL) exact = k; // the latest play that fits exactly
    if (d <= nearDiff + 1e-9) {
      near = k; // nearest; on a tie the latest
      nearDiff = Math.min(nearDiff, d);
    }
  });
  if (exact >= 0) return exact;
  return nearDiff <= NEAR_TOL ? near : -1;
}
// What each of a player's starts still lacks: an array with one amount per start (each in its own league's scoring), or null when any
// start's number matches no point of its running total (no estimate). starts: [{ pts, scoring?, pos? }].
export function pendingEach(starts, plays) {
  if (!plays?.length || !starts?.length) return null;
  const out = [];
  for (const st of starts) {
    const prefix = [0];
    for (const p of plays) prefix.push(prefix[prefix.length - 1] + (typeof p === "number" ? p : scorePlay(p.l, p.y, st.scoring, st.pos)));
    const best = matchedPrefix(prefix, st.pts);
    if (best < 0) return null;
    const pending = r2(prefix[prefix.length - 1] - prefix[best]);
    out.push(Math.abs(pending) < PEND_TOL || Math.abs(pending) > 30 ? 0 : pending);
  }
  return out.some(Boolean) ? out : null;
}

// Starters whose game has just ended: Sleeper posts the last plays a minute or two after the final whistle, so for CATCH_UP_MS after the
// board first sees a game final we keep reading its plays (the board's "ahead of Sleeper" numbers need them), even though the player has
// left the live list. `seen` is { TEAM: ms the board first saw that game final } and is filled in here; a team already final when the page
// opens counts from that moment. Returns the request rows ({ playerId, name, pos, team, side }) for the plays action.
export const CATCH_UP_MS = 10 * 60 * 1000;
export function catchUpPlayers(savedTeams, gameStates, seen, now) {
  if (!gameStates) return [];
  const out = new Map();
  for (const t of savedTeams || []) {
    const s = t.settings || {};
    if (s.isBye) continue;
    for (const [side, list] of [["mine", s.h2h?.mine], ["theirs", s.h2h?.opp]]) {
      for (const p of list || []) {
        const g = p.id && p.team ? gameStates[p.team] : null;
        if (g?.state !== "post") continue;
        seen[p.team] ??= now;
        if (now - seen[p.team] > CATCH_UP_MS) continue;
        out.set(`${side}:${p.id}`, { playerId: p.id, name: p.name, pos: p.pos, team: p.team, side });
      }
    }
  }
  return [...out.values()];
}

// Bench players whose game is on (or ended within the catch-up window): the board asks for their plays too, so a bench number is as current
// as a starter's. Same shape as catchUpPlayers; `seen` is the same remembered "first saw it final" clock.
export function benchPlayers(savedTeams, gameStates, seen, now) {
  if (!gameStates) return [];
  const out = new Map();
  for (const t of savedTeams || []) {
    const s = t.settings || {};
    if (s.isBye) continue;
    for (const [side, list] of [["mine", s.h2h?.mineBench], ["theirs", s.h2h?.oppBench]]) {
      for (const p of list || []) {
        const g = p.id && p.team ? gameStates[p.team] : null;
        if (!g || (g.state !== "in" && g.state !== "post")) continue;
        if (g.state === "post") {
          seen[p.team] ??= now;
          if (now - seen[p.team] > CATCH_UP_MS) continue;
        }
        out.set(`${side}:${p.id}`, { playerId: p.id, name: p.name, pos: p.pos, team: p.team, side });
      }
    }
  }
  return [...out.values()];
}

// Rows with those pending points added to their numbers (each start in its own league's scoring; pts / ptsMin follow the starts) and
// `pending` (the largest) set for the label.
export function applyPending(rows, totals) {
  if (!totals) return rows;
  return rows.map((r) => {
    const each = pendingEach(r.starts, totals[r.playerId]);
    if (!each) return r;
    const starts = r.starts.map((x, i) => ({ ...x, pts: r2(x.pts + each[i]) }));
    const pts = starts.map((x) => x.pts);
    return { ...r, pts: Math.max(...pts), ptsMin: Math.min(...pts), total: r2(pts.reduce((a, b) => a + b, 0)), starts, pending: Math.max(...each) };
  });
}

// The same estimate for a matchup lineup (settings.h2h.mine / .opp, one league): each player's `pts` gets his pending points, and
// `added` is the lineup's total of them, for the scoreboard. Players without a total, or whose number doesn't line up, are untouched.
export function applyPendingToLineup(list, totals, scoring = null) {
  if (!totals || !list) return { list, added: 0 };
  let added = 0;
  const out = list.map((p) => {
    if (!p?.id || typeof p.pts !== "number") return p;
    const pending = pendingEach([{ pts: p.pts, scoring, pos: p.pos }], totals[p.id])?.[0];
    if (!pending) return p;
    added += pending;
    return { ...p, pts: r2(p.pts + pending), pending };
  });
  return { list: out, added: r2(added) };
}

// Remembers when each player's points last went up, so the list can put the newest scoring first.
// prev: { last: {id: pts}, changedAt: {id: ms}, delta: {id: +pts} } (or null on first load). On the first load nothing
// counts as "new" -- we don't know the order things happened in, only what's on the board now.
export function trackScoring(prev, rows, now) {
  // Rows that drop out of the list (the board's scope narrowed to one league) keep their last-known points, so a player who
  // comes back with the same number is not "new"; a row seen for the FIRST time is never new either -- appearing is not
  // scoring (it used to flash with his whole total as the "+" amount).
  const last = { ...(prev?.last || {}) };
  const changedAt = { ...(prev?.changedAt || {}) };
  const delta = { ...(prev?.delta || {}) };
  for (const r of rows) {
    last[r.id] = r.pts;
    const before = prev?.last?.[r.id];
    if (prev && before !== undefined && r.pts !== before) {
      changedAt[r.id] = now;
      delta[r.id] = Math.round((r.pts - (before ?? 0)) * 100) / 100;
    }
  }
  return { last, changedAt, delta };
}

// Newest scoring first, then most points.
export function sortFeed(rows, changedAt = {}) {
  return [...rows].sort((a, b) => (changedAt[b.id] || 0) - (changedAt[a.id] || 0) || b.pts - a.pts || a.name.localeCompare(b.name));
}

// A game day: a game is on, or one kicks off / finished today (local date). Without a scoreboard, fall back to the
// usual NFL days (Thursday, Sunday, Monday).
export function isGameDay(gameStates, now = new Date()) {
  const games = Object.values(gameStates || {});
  if (!games.length) return [0, 1, 4].includes(now.getDay());
  const today = now.toDateString();
  return games.some((g) => g.state === "in" || (g.start && new Date(g.start).toDateString() === today));
}

// A ticking countdown for the Companion's kickoff clock, hours : minutes : seconds with NO days ("61:09:28", "6:58:12"). Down to the second.
// Zero or negative (kickoff passed, the scoreboard hasn't caught up) -> "0:00:00".
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const two = (n) => String(n).padStart(2, "0");
  return `${Math.floor(total / 3600)}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}
