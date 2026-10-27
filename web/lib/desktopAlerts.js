// What My Team's opt-in "Desktop alerts" should say (app/my-team/DesktopAlerts.js fires them with the browser's
// Notification API while the tab is open, even in the background). Pure, no imports; tested in
// test/desktopAlerts.test.mjs. Every alert has a key with the week in it; the caller remembers the keys it has shown
// (localStorage), so each one fires once per player / slot / league per week.
//
// Three kinds:
// - injury: a starter is Doubtful, Out or on IR (from the injury feed, liveRosterNews().byTeam) and his game hasn't
//   kicked off yet -- one alert per player per week, naming every league he starts in.
// - lineup: a starting slot is empty, holds a player on a bye, or an inactive player, within 3 hours of the next
//   kickoff (or while games are on and more are still to come) -- one per slot per league per week.
// - swing: a league's win chance crossed 50% since the last poll while a game in that matchup is in the 4th quarter or
//   overtime -- one per direction per league per week.

import { leagueName } from "./format.js";

const KICKOFF_WINDOW_MS = 3 * 60 * 60 * 1000;

function nextKickoff(gameStates) {
  let next = null;
  for (const g of Object.values(gameStates || {})) {
    if (g.state !== "pre" || !g.start) continue;
    const t = new Date(g.start).getTime();
    if (Number.isFinite(t) && (next == null || t < next)) next = t;
  }
  return next;
}

const leagueOf = (t) => leagueName(t, "a league");

export function findAlerts({ savedTeams, injuriesByTeam, gameStates, prevWin = {}, now = Date.now() }) {
  const out = [];
  const known = gameStates && Object.keys(gameStates).length > 0;
  const started = (team) => known && team && gameStates[team] && gameStates[team].state !== "pre";

  // Injuries: grouped by player across leagues.
  const hurt = new Map();
  for (const t of savedTeams || []) {
    const week = t.settings?.week;
    if (week == null) continue;
    for (const i of injuriesByTeam?.[t.id] || []) {
      if (i.severity < 2) continue;
      const team = (t.players || []).find((p) => p.name === i.name)?.team || null;
      if (started(team)) continue;
      const key = `w${week}|injury|${i.name}`;
      if (!hurt.has(key)) hurt.set(key, { key, name: i.name, status: i.status, leagues: [] });
      hurt.get(key).leagues.push(leagueOf(t));
    }
  }
  for (const h of hurt.values()) {
    out.push({
      key: h.key,
      kind: "injury",
      title: `${h.name} is ${h.status}`,
      body: `He's in your starting lineup in ${h.leagues.join(", ")}.`,
    });
  }

  // Empty / bye / inactive slots close to kickoff.
  const next = nextKickoff(gameStates);
  const near = next != null && next - now <= KICKOFF_WINDOW_MS;
  if (near) {
    for (const t of savedTeams || []) {
      const s = t.settings || {};
      if (s.week == null || s.isBye) continue;
      (s.h2h?.mine || []).forEach((p, i) => {
        let why = null;
        if (!p.id) why = "is empty";
        else if (p.out) why = `has ${p.name}, who isn't active`;
        else if (known && p.team && !gameStates[p.team]) why = `has ${p.name}, whose team is on a bye`;
        if (!why) return;
        const slot = p.slot === "SUPER_FLEX" ? "SUPERFLEX" : p.slot || "A";
        out.push({
          key: `w${s.week}|lineup|${t.id}|${i}`,
          kind: "lineup",
          title: `Lineup hole in ${leagueOf(t)}`,
          body: `Your ${slot} slot ${why}.`,
        });
      });
    }
  }

  // Win chance swings across 50% late in a game.
  for (const t of savedTeams || []) {
    const s = t.settings || {};
    const before = prevWin[t.id];
    const nowWin = s.winChance;
    if (s.week == null || before == null || nowWin == null) continue;
    if ((before >= 0.5) === (nowWin >= 0.5)) continue;
    const late = [...(s.h2h?.mine || []), ...(s.h2h?.opp || [])].some((p) => {
      const g = p.team && gameStates?.[p.team];
      return g && g.state === "in" && Number(g.period) >= 4;
    });
    if (!late) continue;
    const up = nowWin >= 0.5;
    out.push({
      key: `w${s.week}|swing|${t.id}|${up ? "up" : "down"}`,
      kind: "swing",
      title: up ? `You're now favored in ${leagueOf(t)}` : `You've slipped behind in ${leagueOf(t)}`,
      body: `Win chance ${Math.round(before * 100)}% → ${Math.round(nowWin * 100)}% vs ${s.opponent || "your opponent"}.`,
    });
  }
  return out;
}

// Alerts not shown yet, and the updated list of shown keys (newest last, capped so storage stays small).
export function newAlerts(alerts, seen = [], cap = 400) {
  const have = new Set(seen);
  const fresh = alerts.filter((a) => !have.has(a.key));
  return { fresh, seen: [...seen, ...fresh.map((a) => a.key)].slice(-cap) };
}
