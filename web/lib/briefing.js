import { leagueName, round1 } from "./format.js";
import { standing } from "./standing.js";
import { matchupState } from "./matchupState.js";

// The signed-in home page's week (app/hub/YourWeek.js, app/page.js): each saved league's matchup as one row, what to call the member and
// the wins to expect. Pure; tested in test/briefing.test.mjs.

// One row per saved league from the saved snapshot: live score once anyone has scored, else the projections; win chance and its word. Best chance first
// (leagues with no win chance last), so the table reads from your strongest matchup down.
export function weekRows(teams, gameStates = null) {
  const rows = (teams || []).map((t) => {
    const s = t.settings || {};
    const live = Boolean(s.matchupActual && (s.matchupActual.mine > 0 || s.matchupActual.opp > 0));
    const src = live ? s.matchupActual : s.matchupProj;
    // With the live scoreboard the league is read the way the Game Board reads it: a finished matchup is Won / Lost (and sits at 100% / 0%), a locked one You win / Out of reach.
    const ms = gameStates && !s.isBye ? matchupState(s, gameStates) : null;
    const p = s.isBye ? null : ms ? (ms.done && ms.pct != null ? (ms.pct >= 0.5 ? 1 : 0) : ms.pct) : typeof s.winChance === "number" ? s.winChance : null;
    const st = ms ? ms.st : standing(p, false);
    return {
      done: Boolean(ms?.done),
      id: t.id,
      name: leagueName(t, "League"),
      record: s.record || null,
      opponent: s.opponent || null,
      bye: Boolean(s.isBye),
      live,
      mine: typeof src?.mine === "number" ? src.mine : null,
      opp: typeof src?.opp === "number" ? src.opp : null,
      p,
      label: st.label,
      tone: st.tone,
    };
  });
  return rows.sort((a, b) => (b.p ?? -1) - (a.p ?? -1));
}

// What to call the member: the team name they use most across their leagues (usually their Sleeper name).
export function displayName(teams) {
  const n = new Map();
  for (const t of teams || []) if (t.team_name) n.set(t.team_name, (n.get(t.team_name) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// The wins you can expect this week (the sum of the win chances), out of how many, and as a share of them.
export function expectedWins(rows) {
  const r = rows.filter((x) => x.p != null);
  const sum = r.reduce((a, x) => a + x.p, 0);
  return { wins: round1(sum), of: r.length, pct: r.length ? Math.round((sum / r.length) * 100) : 0 };
}
