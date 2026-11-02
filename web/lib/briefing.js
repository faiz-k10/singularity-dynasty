import { leagueName, round1 } from "./format.js";
import { standing } from "./standing.js";

// The signed-in home page's briefing (app/hub/YourWeek.js) and its gravity map (app/hub/GravityMap.js): each saved league's matchup as one
// row, the plain-English summary of the week, and where each league sits in the map. Pure; tested in test/briefing.test.mjs.

// One row per saved league from the saved snapshot: live score once anyone has scored, else the projections; win chance and its word. Best chance first
// (leagues with no win chance last), so the table and the map read from your strongest matchup down.
export function weekRows(teams) {
  const rows = (teams || []).map((t) => {
    const s = t.settings || {};
    const live = Boolean(s.matchupActual && (s.matchupActual.mine > 0 || s.matchupActual.opp > 0));
    const src = live ? s.matchupActual : s.matchupProj;
    const p = s.isBye ? null : typeof s.winChance === "number" ? s.winChance : null;
    const st = standing(p, false);
    return {
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

// A sentence cut into [{ text, name }] pieces so the league names in it can be highlighted (longest name first, so "Dynasty Kingdom" isn't
// swallowed by a shorter one).
export function splitNames(text, names) {
  const list = [...new Set((names || []).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return [{ text, name: false }];
  const re = new RegExp(`(${list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return String(text)
    .split(re)
    .filter(Boolean)
    .map((t) => ({ text: t, name: list.includes(t) }));
}

// What to call the member: the team name they use most across their leagues (usually their Sleeper name).
export function displayName(teams) {
  const n = new Map();
  for (const t of teams || []) if (t.team_name) n.set(t.team_name, (n.get(t.team_name) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// "Good evening" by the viewer's hour.
export function greetingFor(hour) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const list = (names) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`);

// One or two plain sentences on the week: how many matchups you're favored in, then the coin flips, uphill climbs and long shots by name.
export function weekBriefing(rows) {
  const r = rows.filter((x) => x.p != null);
  if (!r.length) return "Your leagues are saved. Your matchups show up here once the week's lineups are set.";
  const fav = r.filter((x) => x.p >= 0.6);
  const toss = r.filter((x) => x.p >= 0.4 && x.p < 0.6);
  const under = r.filter((x) => x.p >= 0.15 && x.p < 0.4);
  const long = r.filter((x) => x.p < 0.15);
  const first =
    fav.length === r.length
      ? r.length === 1
        ? "You're favored in your matchup this week."
        : `You're favored in ${r.length === 2 ? "both" : `all ${r.length}`} of your matchups this week. A clean sweep is in reach.`
      : fav.length === 0
        ? `You aren't favored in any of your ${r.length} matchups yet, so this week needs a little luck.`
        : `You're favored in ${fav.length} of your ${r.length} matchups this week.`;
  const parts = [];
  if (toss.length) parts.push(`${list(toss.map((x) => x.name))} ${toss.length === 1 ? "is" : "are"} a coin flip`);
  if (under.length) parts.push(`${list(under.map((x) => x.name))} ${under.length === 1 ? "is" : "are"} an uphill climb`);
  if (long.length) parts.push(`${list(long.map((x) => x.name))} will need a small miracle`);
  if (!parts.length) return first;
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
  return `${first} ${joined[0].toUpperCase()}${joined.slice(1)}.`;
}

// The gravity map: the core is the singularity; a league's distance from it is 1 - its win chance (favored leagues are pulled in, long shots
// drift to the edge). Distances are in the map's own units (its width = 100): the core's edge at CORE, the outer edge at EDGE.
export const CORE = 15;
export const EDGE = 38;
export const radiusFor = (p) => CORE + (1 - p) * (EDGE - CORE);
// The rings drawn on the map: the standing() cut-offs (Favored 60%+, Toss-up 40-60%, Underdog 15-40%, Long shot under 15%).
export const RINGS = [
  { p: 0.6, label: "Favored inside" },
  { p: 0.4, label: "Toss-up" },
  { p: 0.15, label: "Long shot outside" },
];

// Where each league sits: evenly around the core, leaving the top of the map free for the ring labels, at its distance. Leagues with no
// win chance are left off.
export function gravityNodes(rows) {
  const r = rows.filter((x) => x.p != null);
  const n = r.length;
  return r.map((x, i) => ({ ...x, angle: round1(-90 + ((i + 0.5) * 360) / n), dist: round1(radiusFor(x.p)) }));
}

// The number in the core: the wins you can expect this week (the sum of the win chances), out of how many, and as a share of them.
export function expectedWins(rows) {
  const r = rows.filter((x) => x.p != null);
  const sum = r.reduce((a, x) => a + x.p, 0);
  return { wins: round1(sum), of: r.length, pct: r.length ? Math.round((sum / r.length) * 100) : 0 };
}
