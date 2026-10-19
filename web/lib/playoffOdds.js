// Standings + playoff odds for one Sleeper league (My Team's season view). Pure, no imports; tested in
// test/playoffOdds.test.mjs. The server (app/my-team/actions.js) gathers the inputs once a day per league.
//
// Method (backtested Oct 18 2026 on 339 completed Sleeper league-seasons, ~3,800 team-seasons; see seasonStrengths):
// every regular-season week not yet in the standings is played out a few thousand times.
// - A team's future weekly score = its true strength + weekly noise. True strength is NOT taken as its points per game
//   so far: early scoring only partly predicts the rest of a season, so it is pulled toward the league average by how
//   much a few games can tell (empirical Bayes: shrink = tau^2 / (tau^2 + sigma^2 / games)), and each simulated season
//   draws its own strength for every team (the remaining uncertainty, plus 5% of the league average for roster changes
//   over the rest of the season). Treating points per game as exact made the odds far too sure of themselves: after
//   week 5, teams it put near 2% actually made the playoffs 12% of the time, and teams near 98% only 91%.
// - Weekly noise = the league's own week-to-week spread (pooled across its teams so far).
// - The week being played now starts from the points already scored plus what each team's starters have left
//   (the same split as the matchup win chance), so a nearly-finished week is nearly settled.
// - Ranking: wins (a tie is half), then points for -- Sleeper's default tiebreaker. Best ball ranks by points for.
//   Leagues with a weekly median game add a win for every team scoring above the week's median.
// - Not modelled: divisions (division winners' guaranteed seeds).
// Same inputs + seed -> same answer.

// League-wide shape when there are too few games to measure it (medians over the backtest leagues): a team's weekly
// score swings about 20% of the league average, and teams' true strengths differ by about 11% of it.
const PRIOR_SIGMA = 0.2;
const PRIOR_TAU = 0.108;
// Roster changes over the rest of the season (injuries, trades, waivers): extra strength spread, share of league avg.
const DRIFT = 0.05;

// scores: { [teamId]: [weekly points so far] }. Returns { [teamId]: {mean, sd, tau} } for future weeks:
// mean = shrunk strength, sd = weekly noise, tau = spread of the true strength (drawn once per simulated season).
export function seasonStrengths(scores) {
  const ids = Object.keys(scores);
  const n = ids.length;
  const ppg = {};
  let games = 0;
  for (const id of ids) {
    const v = scores[id] || [];
    ppg[id] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    games = Math.max(games, v.length);
  }
  const known = ids.filter((id) => ppg[id] != null);
  const avg = known.length ? known.reduce((a, id) => a + ppg[id], 0) / known.length : 0;
  let ss = 0;
  let df = 0;
  for (const id of known) {
    for (const x of scores[id]) ss += (x - ppg[id]) ** 2;
    df += scores[id].length - 1;
  }
  // Measured from the league once there are 3+ games each (what the backtest validated), else the typical shape.
  const sigma = games >= 3 && df > 0 ? Math.sqrt(ss / df) : PRIOR_SIGMA * avg;
  let tau2;
  if (games >= 3 && known.length > 2) {
    const varPpg = known.reduce((a, id) => a + (ppg[id] - avg) ** 2, 0) / (known.length - 1);
    tau2 = Math.max(0, varPpg - (sigma * sigma) / games);
  } else tau2 = (PRIOR_TAU * avg) ** 2;
  const out = {};
  for (const id of ids) {
    const g = (scores[id] || []).length;
    if (!g || !avg) {
      out[id] = { mean: avg, sd: sigma, tau: Math.sqrt(tau2 + (DRIFT * avg) ** 2) };
      continue;
    }
    const noise = (sigma * sigma) / g;
    const r = tau2 + noise > 0 ? tau2 / (tau2 + noise) : 0;
    const post = r * noise; // posterior variance of the true strength
    out[id] = {
      mean: Math.round((avg + r * (ppg[id] - avg)) * 10) / 10,
      sd: Math.round(sigma * 10) / 10,
      tau: Math.round(Math.sqrt(post + (DRIFT * avg) ** 2) * 10) / 10,
    };
  }
  return out;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normals(seed) {
  const u = rng(seed);
  let spare = null;
  return () => {
    if (spare != null) {
      const s = spare;
      spare = null;
      return s;
    }
    let a = 0;
    while (a === 0) a = u();
    const r = Math.sqrt(-2 * Math.log(a));
    const th = 2 * Math.PI * u();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
}

const winPts = (t) => t.wins + 0.5 * (t.ties || 0);

// Current standings, ranked. teams: [{id, name, wins, losses, ties, pf, pa}].
export function rankStandings(teams, { byPoints = false } = {}) {
  const sorted = [...teams].sort((a, b) => (byPoints ? 0 : winPts(b) - winPts(a)) || b.pf - a.pf || String(a.name).localeCompare(String(b.name)));
  return sorted.map((t, i) => ({ ...t, rank: i + 1 }));
}

// teams: [{id, wins, losses, ties, pf}] (current standings, before the weeks below).
// weeks: [{ games: [[idA, idB], ...], dist: { [id]: {mean, sd} }, live?: true }] -- every week still to be scored, in
// order. tau: { [id]: spread of each team's true strength } -- one draw per team per simulated season, added to every
// week that isn't `live` (the week being played already has its own live distribution).
// Returns { [id]: {playoffOdds, avgWins, avgRank, firstOdds} }.
export function simulatePlayoffOdds({ teams, weeks, playoffTeams, tau = {}, byPoints = false, medianGame = false, sims = 3000, seed = 20261018 }) {
  const ids = teams.map((t) => t.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const slots = Math.max(0, Math.min(playoffTeams || 0, n));
  const made = new Float64Array(n);
  const first = new Float64Array(n);
  const winSum = new Float64Array(n);
  const rankSum = new Float64Array(n);
  const z = normals(seed);
  const w = new Float64Array(n);
  const pf = new Float64Array(n);
  const score = new Float64Array(n);
  const order = ids.map((_, i) => i);
  const off = new Float64Array(n);
  const tauArr = ids.map((id) => tau[id] || 0);
  // Exact ties (same wins and points) fall back to input order, so the result is stable run to run.
  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) {
      w[i] = winPts(teams[i]);
      pf[i] = teams[i].pf;
      off[i] = tauArr[i] ? z() * tauArr[i] : 0;
    }
    for (const wk of weeks) {
      for (let i = 0; i < n; i++) {
        const d = wk.dist[ids[i]];
        score[i] = d ? Math.max(0, d.mean + (wk.live ? 0 : off[i]) + z() * d.sd) : 0;
        pf[i] += score[i];
      }
      for (const [a, b] of wk.games) {
        const ia = idx.get(a);
        const ib = idx.get(b);
        if (ia == null || ib == null) continue;
        if (score[ia] > score[ib]) w[ia] += 1;
        else if (score[ib] > score[ia]) w[ib] += 1;
        else {
          w[ia] += 0.5;
          w[ib] += 0.5;
        }
      }
      if (medianGame && n > 1) {
        const sorted = Array.from(score).sort((x, y) => x - y);
        const med = (sorted[Math.floor((n - 1) / 2)] + sorted[Math.ceil((n - 1) / 2)]) / 2;
        for (let i = 0; i < n; i++) if (score[i] > med) w[i] += 1;
      }
    }
    order.sort((a, b) => (byPoints ? 0 : w[b] - w[a]) || pf[b] - pf[a] || a - b);
    for (let r = 0; r < n; r++) {
      const i = order[r];
      rankSum[i] += r + 1;
      winSum[i] += w[i];
      if (r < slots) made[i] += 1;
      if (r === 0) first[i] += 1;
    }
  }
  const out = {};
  for (let i = 0; i < n; i++) {
    out[ids[i]] = {
      playoffOdds: Math.round((made[i] / sims) * 1000) / 1000,
      firstOdds: Math.round((first[i] / sims) * 1000) / 1000,
      avgWins: Math.round((winSum[i] / sims) * 10) / 10,
      avgRank: Math.round((rankSum[i] / sims) * 10) / 10,
    };
  }
  return out;
}
