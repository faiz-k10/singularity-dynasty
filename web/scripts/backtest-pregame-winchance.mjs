// Is the head-to-head win chance calibrated BEFORE kickoff? The saved leagues' real 2026 matchups (weeks 1-7, from Sleeper) are replayed: each side's
// starters are projected with the ranges we PUBLISHED that week (redraft_rankings), the matchup is run through lib/winChance.js exactly as My Team does
// with no game started, and the predicted chance is compared with who actually scored more.
//
//   node --env-file=.env.local scripts/backtest-pregame-winchance.mjs
//
// Honest limits: the leagues are the members' own (a few leagues, a few hundred matchups), our projections are in standard PPR while each league scores
// its own way (more noise than the live site has), and only the pregame number is tested -- the in-game part (remaining points) is
// model/backtest_live_remaining_points.R. Reliability bins this small are coarse; read the Brier score and the rough bins, not any one bin.
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../lib/fetchAllRows.js";
import { buildSide, matchupOutlook } from "../lib/winChance.js";
import { normalizePlayerName } from "../lib/portfolio.js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleeper = (p) => fetch(`https://api.sleeper.app/v1${p}`).then((r) => (r.ok ? r.json() : null));

const dir = await fetchAllRows(sb, "player_directory", "sleeper_id, first_name, last_name, position, team, status", (q) => q.order("sleeper_id"));
const info = new Map(dir.map((p) => [String(p.sleeper_id), { name: `${p.first_name} ${p.last_name}`, pos: p.position, team: p.team, active: p.status === "Active" }]));
const proj = await fetchAllRows(sb, "redraft_rankings", "week, player_name, projection, floor, ceiling", (q) => q.eq("season", 2026).order("week").order("player_name"));
const byWeek = {};
for (const r of proj) (byWeek[r.week] ??= new Map()).set(normalizePlayerName(r.player_name), { proj: r.projection, floor: r.floor, ceiling: r.ceiling });
const { data: teams } = await sb.from("saved_teams").select("platform_league_id").eq("platform", "sleeper");
const leagueIds = [...new Set((teams || []).map((t) => t.platform_league_id))];

const rows = [];
for (const id of leagueIds) {
  const league = await sleeper(`/league/${id}`);
  if (!league || league.settings?.best_ball === 1) continue;
  const slots = (league.roster_positions || []).filter((s) => s !== "BN");
  for (let w = 1; w <= 7; w++) {
    const ms = await sleeper(`/league/${id}/matchups/${w}`);
    if (!ms) continue;
    const groups = {};
    for (const m of ms) if (m.matchup_id != null) (groups[m.matchup_id] ??= []).push(m);
    for (const pair of Object.values(groups)) {
      if (pair.length !== 2 || !(pair[0].points > 0) || !(pair[1].points > 0)) continue;
      const [a, b] = pair;
      const side = (m) => buildSide(m.starters, slots, (pid) => info.get(String(pid)) || null, (name) => byWeek[w]?.get(normalizePlayerName(name)) || null, null);
      const out = matchupOutlook({ mine: side(a), opp: side(b) }, {});
      if (out?.winChance == null) continue;
      rows.push({ league: id, week: w, p: out.winChance, win: a.points > b.points ? 1 : a.points < b.points ? 0 : 0.5, projGap: out.mine.projFinal - out.opp.projFinal });
    }
  }
}
console.log(`matchups replayed: ${rows.length} (${leagueIds.length} saved leagues, weeks 1-7)`);
if (rows.length < 30) { console.log("Too few matchups to say anything."); process.exit(0); }

const brier = (f) => rows.reduce((s, r) => s + (f(r) - r.win) ** 2, 0) / rows.length;
const clamp = (x) => Math.min(0.999, Math.max(0.001, x));
const logloss = (f) => -rows.reduce((s, r) => s + (r.win * Math.log(clamp(f(r))) + (1 - r.win) * Math.log(1 - clamp(f(r)))), 0) / rows.length;
const correct = rows.filter((r) => (r.p > 0.5) === (r.win > 0.5) || r.p === 0.5).length / rows.length;
console.log(`\nBrier score (lower is better; 0.250 = always saying 50%):  model ${brier((r) => r.p).toFixed(4)}   coin flip ${brier(() => 0.5).toFixed(4)}`);
console.log(`Log loss:                                                 model ${logloss((r) => r.p).toFixed(4)}   coin flip ${logloss(() => 0.5).toFixed(4)}`);
console.log(`Picked the winner: ${(100 * correct).toFixed(1)}% of ${rows.length} matchups`);
console.log(`\nReliability (does "70%" win about 70% of the time?):`);
const bins = [[0, 0.2], [0.2, 0.35], [0.35, 0.5], [0.5, 0.65], [0.65, 0.8], [0.8, 1.01]];
console.table(bins.map(([lo, hi]) => {
  const r = rows.filter((x) => x.p >= lo && x.p < hi);
  return { said: `${Math.round(lo * 100)}-${Math.min(100, Math.round(hi * 100))}%`, n: r.length, "mean said": r.length ? (100 * r.reduce((s, x) => s + x.p, 0) / r.length).toFixed(1) + "%" : "-", "actually won": r.length ? (100 * r.reduce((s, x) => s + x.win, 0) / r.length).toFixed(1) + "%" : "-" };
}));
// does the model over- or under-state certainty? slope of outcomes on the model's logit (1 = calibrated, < 1 = too confident, > 1 = too timid)
const logit = (p) => Math.log(clamp(p) / (1 - clamp(p)));
let b = 1, a = 0;
for (let it = 0; it < 50; it++) {  // Newton steps for logistic regression of win on logit(p)
  let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
  for (const r of rows) { const x = logit(r.p), q = 1 / (1 + Math.exp(-(a + b * x))), w = q * (1 - q); g0 += r.win - q; g1 += (r.win - q) * x; h00 += w; h01 += w * x; h11 += w * x * x; }
  const det = h00 * h11 - h01 * h01; if (Math.abs(det) < 1e-12) break;
  a += (h11 * g0 - h01 * g1) / det; b += (-h01 * g0 + h00 * g1) / det;
}
console.log(`\nCalibration slope ${b.toFixed(2)} (intercept ${a.toFixed(2)}): 1.00 = calibrated, below 1 = too confident, above 1 = too timid.`);
