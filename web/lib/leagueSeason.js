// Standings + playoff odds for one saved league (My Team's season view), gathered on the server and cached in module
// memory once per league per day (and again whenever Sleeper scores another week). Heavy -- one Sleeper matchups call
// per remaining regular-season week plus a few thousand simulated seasons -- so only the full refresh calls it
// (refreshSavedTeams -> lookupSleeperTeams with { season: true }), never the 30-second poll or the landing page box.
// The math is in lib/playoffOdds.js.
import { fetchSleeperMatchups } from "./sleeper";
import { findProjection } from "./portfolio";
import { buildSide, summarizeSide } from "./winChance";
import { rankStandings, seasonStrengths, simulatePlayoffOdds } from "./playoffOdds";

const cache = new Map();

const dec = (whole, part) => (whole || 0) + (part || 0) / 100;

function rosterName(roster, users) {
  const u = users.find((x) => x.user_id === roster.owner_id);
  return u?.metadata?.team_name || u?.display_name || `Team ${roster.roster_id}`;
}

// Pairs of roster ids playing each other in one week's matchups feed.
function gamesOf(matchups) {
  const byId = new Map();
  for (const m of matchups || []) {
    if (m.matchup_id == null) continue;
    if (!byId.has(m.matchup_id)) byId.set(m.matchup_id, []);
    byId.get(m.matchup_id).push(m.roster_id);
  }
  return [...byId.values()].filter((g) => g.length === 2);
}

// league: Sleeper league object; rosters / users: its rosters + users; currentWeek: the week Sleeper is showing and
// currentMatchups its feed (already fetched by the caller); players: Sleeper dictionary; projByName: lib/weekProjections
// byName; gameStates: lib/gameStatus. Returns null when there's nothing to show (no rosters).
export async function getLeagueSeason({ league, rosters, users, myRosterId, currentWeek, currentMatchups, players, projByName, gameStates }) {
  if (!rosters?.length) return null;
  const s = league.settings || {};
  const lastScored = Number(s.last_scored_leg) || 0;
  const lastRegular = (Number(s.playoff_week_start) || 15) - 1;
  const key = `${league.league_id}:${new Date().toDateString()}:${lastScored}`;
  if (cache.has(key)) return cache.get(key);

  const medianGame = s.league_average_match === 1;
  const teams = rosters.map((r) => {
    const st = r.settings || {};
    return {
      id: r.roster_id,
      name: rosterName(r, users),
      wins: st.wins || 0,
      losses: st.losses || 0,
      ties: st.ties || 0,
      pf: Math.round(dec(st.fpts, st.fpts_decimal) * 100) / 100,
      pa: Math.round(dec(st.fpts_against, st.fpts_against_decimal) * 100) / 100,
    };
  });

  // Each team's weekly scores so far (one Sleeper matchups call per scored week) -> how strong each team really is and
  // how much a week swings in this league (lib/playoffOdds.js seasonStrengths, backtested).
  const infoFor = (id) => {
    const p = players?.[id];
    if (!p) return null;
    return { name: `${p.first_name || ""} ${p.last_name || ""}`.trim(), pos: p.position || null, team: p.team || null, active: p.status ? p.status === "Active" : true };
  };
  const projFor = (name) => findProjection(projByName, name);
  const pastNums = [];
  for (let w = 1; w <= Math.min(lastScored, lastRegular); w++) pastNums.push(w);
  const pastFeeds = await Promise.all(pastNums.map((w) => fetchSleeperMatchups(league.league_id, w).catch(() => null)));
  const scores = Object.fromEntries(rosters.map((r) => [r.roster_id, []]));
  for (const feed of pastFeeds) {
    // A week where nobody scored wasn't played (a league that started late) -- it says nothing about anyone.
    if (!(feed || []).some((m) => (m.points || 0) > 0)) continue;
    for (const m of feed) if (scores[m.roster_id] && typeof m.points === "number") scores[m.roster_id].push(m.points);
  }
  const strength = seasonStrengths(scores);
  const tau = Object.fromEntries(Object.entries(strength).map(([id, v]) => [id, v.tau]));

  // Every regular-season week not yet in the standings: this week from its live state, later weeks from strength.
  const weekNums = [];
  for (let w = Math.max(lastScored + 1, 1); w <= lastRegular; w++) weekNums.push(w);
  const feeds = await Promise.all(
    weekNums.map((w) => (w === currentWeek && currentMatchups ? currentMatchups : fetchSleeperMatchups(league.league_id, w).catch(() => null)))
  );
  const weeks = weekNums.map((w, i) => {
    const feed = feeds[i];
    const dist = { ...strength };
    // The week being played counts as "live" once anyone has points on the board; before kickoff it's just another
    // future week (league-scale strength + the season-long strength draw).
    const live = w === currentWeek && Boolean(feed) && feed.some((m) => (m.points || 0) > 0);
    if (live) {
      for (const m of feed) {
        const base = strength[m.roster_id];
        if (!base) continue;
        const side = summarizeSide(buildSide(m.starters, null, infoFor, projFor, m.players_points), gameStates);
        let rest = 0;
        let v = 0;
        let full = 0;
        for (const p of side.players) {
          rest += p.outlook.mid;
          v += ((p.outlook.sdLo + p.outlook.sdHi) / 2) ** 2;
          if (p.id) full += Math.max(0, p.proj || 0);
        }
        // Points scored are Sleeper's, in this league's scoring; what's still to come is on our projections' scale,
        // so it's converted with the ratio of the team's league-scale strength to its full lineup projection.
        const k = full > 0 ? Math.min(2, Math.max(0.5, base.mean / full)) : 1;
        dist[m.roster_id] = { mean: (m.points || 0) + k * rest, sd: k * Math.sqrt(v) };
      }
    }
    return { games: gamesOf(feed), dist, live };
  });

  const playoffTeams = Number(s.playoff_teams) || 0;
  const odds = simulatePlayoffOdds({ teams, weeks, playoffTeams, tau, medianGame, sims: 3000 });
  // "settled": the number is a fact, not a simulation result -- the regular season is over, or the team can't reach
  // the current playoff cut's wins even by winning out (shown as 0% then; otherwise a 0 from the sims reads "<1%").
  const ranked = rankStandings(teams);
  const cutWins = playoffTeams && ranked[playoffTeams - 1] ? ranked[playoffTeams - 1].wins + 0.5 * (ranked[playoffTeams - 1].ties || 0) : null;
  const gamesLeft = weekNums.length * (medianGame ? 2 : 1);
  const standings = ranked.map((t) => ({
    ...t,
    ...odds[t.id],
    settled: weekNums.length === 0 || (cutWins != null && t.wins + 0.5 * (t.ties || 0) + gamesLeft < cutWins),
    mean: strength[t.id]?.mean ?? null,
    isMe: String(t.id) === String(myRosterId),
  }));
  const value = {
    computedAt: Date.now(),
    lastScoredWeek: lastScored,
    weeksLeft: weekNums.length,
    playoffTeams,
    medianGame,
    standings,
  };
  cache.set(key, value);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}
