// Standings + playoff odds for one saved league (My Team's season view), gathered on the server and cached in module
// memory once per league per day (and again whenever Sleeper scores another week). Heavy -- one Sleeper matchups call
// per remaining regular-season week plus a few thousand simulated seasons -- so only the full refresh calls it
// (refreshSavedTeams -> lookupSleeperTeams with { season: true }), never the 30-second poll or the landing page box.
// The math is in lib/playoffOdds.js.
import { fetchSleeperMatchups } from "./sleeper";
import { normalizePlayerName } from "./portfolio";
import { buildSide, summarizeSide, DEFAULT_RANGES } from "./winChance";
import { rankStandings, teamStrength, simulatePlayoffOdds } from "./playoffOdds";

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

  const byPoints = s.best_ball === 1;
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

  // Each team's lineup as our weekly ranges (a starter on a bye this week stands in at a typical score).
  const infoFor = (id) => {
    const p = players?.[id];
    if (!p) return null;
    return { name: `${p.first_name || ""} ${p.last_name || ""}`.trim(), pos: p.position || null, team: p.team || null, active: p.status ? p.status === "Active" : true };
  };
  const projFor = (name) => projByName?.[normalizePlayerName(name)] || null;
  const boardKnown = gameStates && Object.keys(gameStates).length > 0;
  const entryByRoster = new Map((currentMatchups || []).map((m) => [m.roster_id, m]));
  const strength = {};
  for (const r of rosters) {
    const starters = entryByRoster.get(r.roster_id)?.starters || r.starters || [];
    const lineup = byPoints
      ? []
      : buildSide(starters, null, infoFor, projFor, null).map((p) =>
          p.id && boardKnown && p.team && !gameStates[p.team] && !p.out ? { ...p, ...(DEFAULT_RANGES[p.pos] || {}) } : p
        );
    const t = teams.find((x) => x.id === r.roster_id);
    const games = t.wins + t.losses + t.ties;
    strength[r.roster_id] = teamStrength(lineup, games ? t.pf / games : null, games);
  }

  // Every regular-season week not yet in the standings: this week from its live state, later weeks from strength.
  const weekNums = [];
  for (let w = Math.max(lastScored + 1, 1); w <= lastRegular; w++) weekNums.push(w);
  const feeds = await Promise.all(
    weekNums.map((w) => (w === currentWeek && currentMatchups ? currentMatchups : fetchSleeperMatchups(league.league_id, w).catch(() => null)))
  );
  const weeks = weekNums.map((w, i) => {
    const feed = feeds[i];
    const dist = { ...strength };
    if (w === currentWeek && feed) {
      for (const m of feed) {
        if (byPoints) {
          const base = strength[m.roster_id];
          dist[m.roster_id] = { mean: Math.max(m.points || 0, base.mean), sd: base.sd };
          continue;
        }
        const side = summarizeSide(buildSide(m.starters, null, infoFor, projFor, m.players_points), gameStates);
        let mean = side.pts;
        let v = 0;
        for (const p of side.players) {
          mean += p.outlook.mid;
          v += ((p.outlook.sdLo + p.outlook.sdHi) / 2) ** 2;
        }
        dist[m.roster_id] = { mean, sd: Math.sqrt(v) };
      }
    }
    return { games: gamesOf(feed), dist };
  });

  const playoffTeams = Number(s.playoff_teams) || 0;
  const odds = simulatePlayoffOdds({ teams, weeks, playoffTeams, byPoints, medianGame, sims: 3000 });
  const standings = rankStandings(teams, { byPoints }).map((t) => ({
    ...t,
    ...odds[t.id],
    mean: strength[t.id]?.mean ?? null,
    isMe: String(t.id) === String(myRosterId),
  }));
  const value = {
    computedAt: Date.now(),
    lastScoredWeek: lastScored,
    weeksLeft: weekNums.length,
    playoffTeams,
    byPoints,
    medianGame,
    standings,
  };
  cache.set(key, value);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}
