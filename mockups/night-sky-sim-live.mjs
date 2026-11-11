// Run: node mockups/night-sky-sim-live.mjs -- the Night Sky as SHIPPED (web/lib/nightSky.js: award, gradePicks, rollSeason, events), not a copy
// of its rules. Three NFL years (Sept 2026 - Aug 2029) for light / regular / engaged members, in season and offseason, with Beat the Model.
import { freshState, award, gradePicks, eventFor, LADDER, TITLES, CATALOGUE_SIZE, SET_COUNT, DAY } from "../web/lib/nightSky.js";

const ACTIONS = ["board", "waivers", "rankings", "compare", "sims", "lab", "dynasty"];
const START = Date.UTC(2026, 8, 9); // the Wednesday before week 1, 2026
const seasonStart = (y) => Date.UTC(y, 8, 9);
const weekOf = (t) => { // Sleeper's display week (1-18 regular season), 0 outside it
  const y = new Date(t).getUTCMonth() >= 2 ? new Date(t).getUTCFullYear() : new Date(t).getUTCFullYear() - 1;
  const w = Math.floor((t - seasonStart(y)) / (7 * DAY)) + 1;
  return w >= 1 && w <= 18 ? w : 0;
};
const seasonOf = (t) => { const d = new Date(t); return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; }; // flips in March
const inSeason = (t) => weekOf(t) > 0 || (new Date(t).getUTCMonth() === 0); // weeks 1-18 + January playoffs

function member(perDay, offseasonShare, years = 3) {
  const s = freshState();
  const out = { years: [], finds: [0, 0, 0, 0, 0], vers: [0, 0, 0, 0], firstTier: {}, earlyTiers: [0, 0, 0, 0, 0], lateTiers: [0, 0, 0, 0, 0] };
  let year = null, y0 = { points: 0, finds: 0, actions: 0, sets: 0 };
  const close = () => { if (year != null) out.years.push({ season: year, points: s.points - y0.points, finds: s.findsTotal - y0.finds, actions: s.actions - y0.actions, sets: Object.keys(s.sets).length - y0.sets, total: s.points }); };
  for (let t = START; t < START + years * 365 * DAY; t += DAY) {
    const season = seasonOf(t);
    if (season !== year) { close(); year = season; y0 = { points: s.points, finds: s.findsTotal, actions: s.actions, sets: Object.keys(s.sets).length }; }
    const week = weekOf(t), date = new Date(t), day = date.toISOString().slice(0, 10);
    const ctx0 = { day, event: eventFor(date, week), season };
    const rate = inSeason(t) ? perDay : perDay * offseasonShare;
    const todays = ACTIONS.filter(() => Math.random() < rate / ACTIONS.length);
    todays.forEach((a, i) => {
      const before = s.pending.length;
      award(s, a, { ...ctx0, now: t + 20 * 3600e3 + i * 180e3 }, Math.random); // one evening session, actions 3 minutes apart
      for (const f of s.pending.slice(before)) {
        out.finds[f.tier - 1]++; out.vers[["", "prismatic", "ancient", "mythic"].indexOf(f.version)]++;
        const wk = (t - seasonStart(season)) / (7 * DAY);
        if (wk >= 0 && wk < 4) out.earlyTiers[f.tier - 1]++; if (wk >= 12 && wk < 18) out.lateTiers[f.tier - 1]++;
        out.firstTier[f.tier] ??= (t - START) / (7 * DAY);
      }
    });
    s.pending = []; s.log = []; // the member looks through the telescope
    if (week && date.getUTCDay() === 2 && Math.random() < Math.min(1, perDay / 2)) { // Tuesday: this week's three picks, 55% right
      const key = `${season}-${week}`, pts = {};
      const pairs = [0, 1, 2].map((i) => { const a = `a${i}`, b = `b${i}`; const right = Math.random() < 0.55; pts[a] = right ? 10 : 5; pts[b] = right ? 5 : 10; return { a, b }; });
      s.picks[key] = { season, week, pairs, choice: [0, 0, 0], graded: false };
      gradePicks(s, key, pts, { day, now: t + 6 * DAY, season }, Math.random);
      delete s.picks[key];
    }
  }
  close();
  return { s, out };
}

const profiles = { Light: [1, 0.3], Regular: [3, 0.35], Engaged: [6, 0.5] }; // actions a day in season, offseason share of that
const N = 600;
const rungAt = (p) => LADDER.filter((r) => p >= r.at).length;
for (const [label, [rate, off]] of Object.entries(profiles)) {
  const runs = Array.from({ length: N }, () => member(rate, off));
  const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / N;
  const med = (f) => { const v = runs.map(f).filter((x) => x != null).sort((a, b) => a - b); return v.length < N / 2 ? null : v[Math.floor(N / 2)]; };
  const pct = (f) => ((100 * runs.filter(f).length) / N).toFixed(0) + "%";
  const finds = avg((r) => r.out.finds.reduce((a, b) => a + b, 0));
  const share = (arr) => { const n = arr.reduce((a, b) => a + b, 0) || 1; return arr.map((x) => ((100 * x) / n).toFixed(0)).join(" / "); };
  console.log(`\n=== ${label}: ${rate} a day in season, ${(rate * off).toFixed(1)} offseason ===`);
  for (let y = 0; y < 3; y++) {
    const yr = (f) => avg((r) => f(r.out.years[y] || {}));
    console.log(`  year ${y + 1}: ${yr((x) => x.actions).toFixed(0)} actions, ${yr((x) => x.finds).toFixed(0)} finds (${(yr((x) => x.actions) / yr((x) => x.finds)).toFixed(2)} actions a find), ${yr((x) => x.sets).toFixed(1)} sets, ${yr((x) => x.points).toFixed(0)} points (total ${yr((x) => x.total).toFixed(0)}, ${(yr((x) => rungAt(x.total))).toFixed(1)} of ${LADDER.length} rungs)`);
  }
  console.log(`  finds by tier % (small / comet / planet / shower / stellar): ${share(runs.reduce((a, r) => a.map((x, i) => x + r.out.finds[i]), [0, 0, 0, 0, 0]))}`);
  console.log(`  first 4 weeks of a season vs weeks 12-18 (tiers %): ${share(runs.reduce((a, r) => a.map((x, i) => x + r.out.earlyTiers[i]), [0, 0, 0, 0, 0]))}  vs  ${share(runs.reduce((a, r) => a.map((x, i) => x + r.out.lateTiers[i]), [0, 0, 0, 0, 0]))}`);
  console.log(`  weeks to first: comet ${med((r) => r.out.firstTier[2])?.toFixed(1)}, planet ${med((r) => r.out.firstTier[3])?.toFixed(1)}, stellar ${med((r) => r.out.firstTier[5])?.toFixed(1) ?? "most never (3 yrs)"}`);
  console.log(`  after 3 years: catalogue ${avg((r) => Object.keys(r.s.found).length).toFixed(0)} of ${CATALOGUE_SIZE}, sets ${avg((r) => Object.keys(r.s.sets).length).toFixed(0)} of ${SET_COUNT}, Beat the Model ${avg((r) => r.s.btm[0]).toFixed(0)}-${avg((r) => r.s.btm[1]).toFixed(0)}`);
  console.log(`  reach (ever, 3 yrs): week of plan time ${pct((r) => r.s.points >= 1100)}, poster ${pct((r) => r.s.points >= 5500)}, free month ${pct((r) => r.s.points >= 12000)}, Event Horizon ${pct((r) => r.s.points >= 40000)}; year 1 poster ${pct((r) => r.out.years[0].total >= 5500)}, year 1 free month ${pct((r) => r.out.years[0].total >= 12000)}`);
  console.log(`  ever saw: stellar event ${pct((r) => r.out.finds[4] > 0)}, ancient ${pct((r) => r.out.vers[2] > 0)}, mythic ${pct((r) => r.out.vers[3] > 0)}; titles at 3 yrs: ${TITLES.map(([at, name]) => `${name} ${pct((r) => r.s.points >= at && !TITLES.some(([b]) => b > at && r.s.points >= b))}`).join(", ")}`);
}
