// Standings + playoff odds for one Sleeper league (My Team's season view). Pure, no imports; tested in
// test/playoffOdds.test.mjs. The server (app/my-team/actions.js) gathers the inputs once a day per league.
//
// Method: every week not yet in the standings (league.settings.last_scored_leg) is played out a few thousand times.
// - Each team's score in a future week is a normal draw: mean = half its current lineup's projection (our weekly
//   medians for the starters it has set; a starter on a bye this week stands in at a typical score for his position)
//   + half its points per game so far (which carries the league's own scoring and lineup luck); spread = its
//   starters' weekly spreads (from floor / ceiling) added in quadrature, at least 12 points (best ball, with no lineup
//   to read: points per game alone, spread 20% of it).
// - The week being played now starts from the points already scored plus what each team's starters have left
//   (the same split as the matchup win chance), so a nearly-finished week is nearly settled.
// - Ranking: wins (a tie is half), then points for -- Sleeper's default tiebreaker. Best ball ranks by points for.
//   Leagues with a weekly median game add a win for every team scoring above the week's median.
// - Not modelled: divisions (division winners' guaranteed seeds), injuries / trades beyond this week's lineup.
// Same inputs + seed -> same answer.

const MIN_SD = 12;

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

// A future week's score for one team: {mean, sd}. lineup: [{proj, floor, ceiling}] (Sleeper starters already mapped
// to our weekly ranges), ppg: its points per game so far (null early in the season).
export function teamStrength(lineup, ppg, gamesPlayed) {
  let mean = 0;
  let varSum = 0;
  for (const p of lineup || []) {
    const med = Math.max(0, p.proj || 0);
    const lo = typeof p.floor === "number" ? Math.max(0, med - p.floor) / 1.2816 : med * 0.5;
    const hi = typeof p.ceiling === "number" ? Math.max(0, p.ceiling - med) / 1.6 : med * 0.5;
    mean += med;
    varSum += ((lo + hi) / 2) ** 2;
  }
  // No lineup to read (best ball) -> points per game alone; too few games -> the lineup alone.
  const hasLineup = mean > 0;
  const blended = !hasLineup ? ppg || 0 : ppg != null && gamesPlayed >= 3 ? 0.5 * mean + 0.5 * ppg : mean;
  // Without a lineup, a typical weekly swing of ~20% of the team's average.
  const sd = hasLineup ? Math.sqrt(varSum) : 0.2 * blended;
  return { mean: Math.round(blended * 10) / 10, sd: Math.max(MIN_SD, Math.round(sd * 10) / 10) };
}

// teams: [{id, wins, losses, ties, pf}] (current standings, before the weeks below).
// weeks: [{ games: [[idA, idB], ...], dist: { [id]: {mean, sd} } }] -- every week still to be scored, in order.
// Returns { [id]: {playoffOdds, avgWins, avgRank, firstOdds} }.
export function simulatePlayoffOdds({ teams, weeks, playoffTeams, byPoints = false, medianGame = false, sims = 3000, seed = 20261018 }) {
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
  // Exact ties (same wins and points) fall back to input order, so the result is stable run to run.
  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) {
      w[i] = winPts(teams[i]);
      pf[i] = teams[i].pf;
    }
    for (const wk of weeks) {
      for (let i = 0; i < n; i++) {
        const d = wk.dist[ids[i]];
        score[i] = d ? Math.max(0, d.mean + z() * d.sd) : 0;
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
