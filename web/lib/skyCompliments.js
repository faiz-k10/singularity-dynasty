import { leagueName, ordinal } from "./format.js";

// The Night Sky's compliments (Nov 2026, founder: "rosterbating" is frowned on, so the game does it for you). Every line is a TRUE, flattering
// fact about the member's own saved leagues -- never invented. teams: saved_teams rows; dynastyTop: Set of normalized names in the Dynasty
// Board's top 50. Returns [{ head, body }], best first; empty when nothing true and flattering can be said. Pure; tested in test/nightSky.test.mjs.
const norm = (n) => String(n || "").toLowerCase().replace(/[^a-z]/g, "");

export function complimentsFor(teams, dynastyTop = new Set()) {
  const out = [];
  for (const t of teams || []) {
    const s = t.settings || {}, lg = leagueName(t, "your league"), players = t.players || [];
    const me = s.season?.standings?.find((x) => x.isMe), table = s.season?.standings || [];
    if (me && me.rank <= 3 && table.length >= 6) out.push({ head: `${ordinal(me.rank)} of ${table.length} in ${lg}`, body: `${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ""} and climbing. The standings agree with you.` });
    if (me && table.length >= 6) {
      const pfRank = [...table].sort((a, b) => b.pf - a.pf).findIndex((x) => x.isMe) + 1;
      if (pfRank <= 2) out.push({ head: pfRank === 1 ? `The most points in ${lg}` : `The second-most points in ${lg}`, body: `${Math.round(me.pf).toLocaleString()} points for. Whatever the record says, this team scores.` });
    }
    const odds = typeof s.playoffOdds === "number" ? s.playoffOdds : null;
    if (odds != null && odds >= 0.6 && !s.playoffSettled) out.push({ head: `Playoffs ${Math.round(odds * 100)}% in ${lg}`, body: "The season played out 3,000 times, and your team is in the playoffs in most of them." });
    const mp = s.matchupProj;
    if (mp && mp.mine > mp.opp + 3) out.push({ head: `Your starters out-project ${s.opponent || "your opponent"}'s by ${Math.round(mp.mine - mp.opp)}`, body: `This week in ${lg}, on our projections.` });
    const heroes = players.filter((p) => p.achievements?.some((a) => a.key === "hero")).length;
    if (heroes >= 2) out.push({ head: `${heroes} Super Heroes on one roster`, body: `In ${lg}, ${heroes} of your players have finished top-3 at their position this season.` });
    const elite = players.filter((p) => p.achievements?.some((a) => a.key === "eliteRole" || a.key === "elitePlayer")).length;
    if (elite >= 2) out.push({ head: `${elite} elite players in ${lg}`, body: "Top five at their position in how they're used or what they do with it." });
    const pickups = players.filter((p) => p.isStarter && p.acquired === "pickup").length;
    if (pickups >= 2) out.push({ head: `${pickups} of your starters came off waivers`, body: `In ${lg}. That's scouting, not luck.` });
    const top50 = players.filter((p) => dynastyTop.has(norm(p.name))).length;
    if (top50 >= 3 && s.leagueType === "dynasty") out.push({ head: `${top50} of the Dynasty Board's top 50`, body: `All on your roster in ${lg}. A dynasty built right.` });
  }
  return out;
}
