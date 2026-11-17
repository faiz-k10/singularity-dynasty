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

    // Nov 17 2026 (founder: "a greater variety of rosterbating compliments") -- still only what his own leagues say is true
    const has = (p, key) => p.achievements?.some((a) => a.key === key);
    const named = (list, max = 3) => list.length > max ? `${list.slice(0, max).join(", ")} and ${list.length - max} more` : list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
    const poss = (n) => (/s$/i.test(n) ? `${n}'` : `${n}'s`);
    const first = (n) => String(n).split(" ")[0];
    const star = players.map((p) => ({ p, wins: p.achievements?.find((a) => a.key === "hero")?.wins || 0 })).sort((a, b) => b.wins - a.wins)[0];
    if (star?.wins >= 2) out.push({ head: `${star.p.name}: ${star.wins}x Super Hero`, body: `${star.wins} top-3 finishes at ${star.p.position || "his position"} this season, and he plays for you in ${lg}.` });
    const fire = players.filter((p) => has(p, "onFire")).map((p) => p.name);
    if (fire.length) out.push({ head: fire.length === 1 ? `${fire[0]} is on fire` : `${fire.length} of your players are on fire`, body: `${fire.length === 1 ? "He's" : `${named(fire)} are`} scoring above what we expected, game after game. ${lg} is feeling it.` });
    const honest = players.filter((p) => has(p, "honorable")).map((p) => p.name);
    if (honest.length >= 2) out.push({ head: `${honest.length} players beating their expected points`, body: `In ${lg}, ${named(honest)} have outscored their expected fantasy points in at least 4 of their last 5 games.` });
    const buy = players.filter((p) => has(p, "buyLow")).map((p) => p.name);
    if (buy.length) out.push({ head: buy.length === 1 ? `${buy[0]} is a Buy Low` : `${buy.length} Buy Lows on your roster`, body: `In ${lg}: production the box score hasn't caught up to yet. You already have ${buy.length === 1 ? "him" : "them"}.` });
    const eddies = players.filter((p) => p.isStarter && has(p, "locked")).map((p) => p.name);
    if (eddies.length >= 2) out.push({ head: `${eddies.length} Steady Eddys in your lineup`, body: `${named(eddies)}: narrow ranges and a floor you can count on, in ${lg}.` });
    const big = players.filter((p) => p.isStarter && p.myCeiling >= 30).sort((a, b) => b.myCeiling - a.myCeiling)[0];
    if (big) out.push({ head: `${poss(big.name)} ceiling this week: ${Math.round(big.myCeiling)}`, body: `The biggest in your lineup in ${lg}. One big game from ${first(big.name)} wins a matchup on its own.` });
    const live = s.matchupActual;
    if (live && live.mine > live.opp + 5) out.push({ head: `Up ${Math.round(live.mine - live.opp)} on ${s.opponent || "your opponent"}`, body: `Right now, in ${lg}.` });
    if (typeof s.winChance === "number" && s.winChance >= 0.7 && s.winChance < 0.99 && !(live && live.mine !== live.opp)) out.push({ head: `Favored against ${s.opponent || "your opponent"}`, body: `${Math.round(s.winChance * 100)}% to win this week in ${lg}.` });
    const starters = players.filter((p) => p.isStarter);
    const drafted = starters.filter((p) => p.acquired === "drafted").length;
    if (drafted >= 4 && drafted >= starters.length / 2) out.push({ head: `You drafted ${drafted} of your starters`, body: `In ${lg}. Your draft is still paying off.` });
    if (me && table.length >= 6) {
      const pfRank = [...table].sort((a, b) => b.pf - a.pf).findIndex((x) => x.isMe) + 1;
      const paRank = [...table].sort((a, b) => b.pa - a.pa).findIndex((x) => x.isMe) + 1;
      if (pfRank <= 4 && paRank === 1 && me.rank > pfRank) out.push({ head: `Your record undersells you in ${lg}`, body: `${Math.round(me.pf).toLocaleString()} points for, and the most points scored against anyone in the league.` });
      const strongest = [...table].sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0))[0];
      if (strongest?.isMe && me.mean != null && me.rank > 1) out.push({ head: `The strongest team in ${lg}`, body: "By our team-strength numbers, nobody in the league is better. The standings will catch up." });
    }
    if (s.playoffSettled && s.playoffOdds === 1) out.push({ head: `Clinched in ${lg}`, body: "A playoff spot, locked in. Everything from here is a bonus." });
  }

  // across all his leagues
  const where = new Map();
  for (const t of teams || []) for (const p of t.players || []) {
    const e = where.get(p.name) || { n: 0, p };
    e.n++; where.set(p.name, e);
  }
  const everywhere = [...where.values()].filter((e) => e.n >= 3 && e.p.achievements?.some((a) => a.key === "hero" || a.key === "onFire")).sort((a, b) => b.n - a.n || (b.p.myProjPts || 0) - (a.p.myProjPts || 0))[0];
  if (everywhere) out.push({ head: `${everywhere.p.name} in ${everywhere.n} of your leagues`, body: "When he scores, you score everywhere. Conviction pays." });
  const bound = (teams || []).filter((t) => typeof t.settings?.playoffOdds === "number" && t.settings.playoffOdds >= 0.6).length;
  if (bound >= 2) out.push({ head: `Playoff-bound in ${bound} of ${teams.length} leagues`, body: "Most managers would take one." });
  const heroes = new Set();
  for (const t of teams || []) for (const p of t.players || []) if (p.achievements?.some((a) => a.key === "hero")) heroes.add(p.name);
  if (heroes.size >= 4 && (teams || []).length >= 2) out.push({ head: `${heroes.size} Super Heroes across your rosters`, body: "Players with a top-3 finish at their position this season. You find them." });
  return out;
}
