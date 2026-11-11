// Run: node mockups/night-sky-sim-live.mjs -- the Night Sky as SHIPPED (web/lib/nightSky.js: award, gradePicks, rollSeason, events), not a copy
// of its rules. Three NFL years (Sept 2026 - Aug 2029) for light / regular / engaged members, in season and offseason, with Beat the Model.
import { freshState, award, gradePicks, eventFor, seasonProgress, unlockSkins, SKINS, LADDER, rungLabel, CATALOGUE_SIZE, SET_COUNT, DAY } from "../web/lib/nightSky.js";

const ACTIONS = ["board", "waivers", "rankings", "compare", "sims", "lab", "dynasty"];
const START = Date.UTC(2026, 8, 9); // the Wednesday before week 1, 2026
const seasonStart = (y) => Date.UTC(y, 8, 9);
const weekOf = (t) => { // Sleeper's display week (1-18 regular season), 0 outside it
  const y = new Date(t).getUTCMonth() >= 2 ? new Date(t).getUTCFullYear() : new Date(t).getUTCFullYear() - 1;
  const w = Math.floor((t - seasonStart(y)) / (7 * DAY)) + 1;
  return w >= 1 && w <= 18 ? w : 0;
};
const seasonOf = (t) => { const d = new Date(t); return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; }; // the NFL league year flips in March
const skySeasonOf = (t) => { const d = new Date(t); return d.getUTCMonth() >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; }; // the sky's season starts at kickoff
const inSeason = (t) => weekOf(t) > 0 || (new Date(t).getUTCMonth() === 0); // weeks 1-18 + January playoffs

function member(perDay, offseasonShare, years = 3) {
  const s = freshState();
  const out = { skinAt: {}, rewardDays: [], years: [], finds: [0, 0, 0, 0, 0], vers: [0, 0, 0, 0], firstTier: {}, earlyTiers: [0, 0, 0, 0, 0], lateTiers: [0, 0, 0, 0, 0] };
  let year = null, y0 = { points: 0, finds: 0, actions: 0, sets: 0 };
  const close = () => { if (year != null) out.years.push({ season: year, points: s.points - y0.points, finds: s.findsTotal - y0.finds, actions: s.actions - y0.actions, sets: Object.keys(s.sets).length - y0.sets, total: s.points, track: seasonProgress(s).done.filter(Boolean).length, doneList: seasonProgress(s).done, season: year }); };
  for (let t = START; t < START + years * 365 * DAY; t += DAY) {
    const season = seasonOf(t);
    if (skySeasonOf(t) !== year) { close(); year = skySeasonOf(t); y0 = { points: s.points, finds: s.findsTotal, actions: s.actions, sets: Object.keys(s.sets).length }; }
    const week = weekOf(t), date = new Date(t), day = date.toISOString().slice(0, 10);
    const ctx0 = { day, event: eventFor(date, week), season, skySeason: skySeasonOf(t) };
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
    // what the store does after every action: unlock skins; then note every named reward earned today (a ladder rung or a skin)
    for (const k of unlockSkins(s, t)) out.skinAt[k.id] = (t - START) / (7 * DAY);
    const sp = seasonProgress(s), track1 = sp.done.filter(Boolean).length;
    const newSkins = Object.values(out.skinAt).filter((w) => w === (t - START) / (7 * DAY)).length;
    if ((track1 > (out.lastTrack ?? 0) && s.season === out.lastSeason) || newSkins) out.rewardDays.push((t - START) / DAY);
    out.lastTrack = track1; out.lastSeason = s.season;
    sp.done.forEach((d, i) => { const k = `${s.season}:${i}`; if (d && out.rungAt?.[k] == null) (out.rungAt ||= {})[k] = (t - seasonStart(s.season)) / (7 * DAY); });
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

// actions a day in season, offseason share of that. Hardcore = all 7 actions on ~95% of days, all year (the free month is for them alone).
const ALL = { Light: [1, 0.3], Regular: [3, 0.35], "Upper regular": [4, 0.4], Engaged: [6, 0.5], Hardcore: [6.65, 0.95] };
const profiles = process.env.PROFILES ? Object.fromEntries(process.env.PROFILES.split(",").map((k) => [k, ALL[k]])) : ALL;
const N = Number(process.env.N || 600);
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
    console.log(`  season ${y + 1}: ${yr((x) => x.actions).toFixed(0)} actions, ${yr((x) => x.finds).toFixed(0)} finds (${(yr((x) => x.actions) / yr((x) => x.finds)).toFixed(2)} actions a find), ${yr((x) => x.sets).toFixed(1)} sets, ${yr((x) => x.points).toFixed(0)} points, ${yr((x) => x.track).toFixed(1)} of ${LADDER.length} ladder rungs`);
  }
  const q = (y, p) => { const v = runs.map((r) => r.out.years[y]?.points || 0).sort((a, b) => a - b); return Math.round(v[Math.floor((N - 1) * p)]); };
  for (let y = 0; y < 3; y++) console.log(`  season ${y + 1} points, 10th / 25th / median / 75th / 90th / 99th percentile: ${[0.1, 0.25, 0.5, 0.75, 0.9, 0.99].map((p) => q(y, p).toLocaleString()).join(" / ")}`);
  for (let y = 0; y < 3; y++) console.log(`  ladder rungs reached, season ${y + 1}: ${LADDER.map((r, i) => `${rungLabel(r)} ${pct((q) => (q.out.years[y]?.doneList || [])[i])}`).join(", ")}`);
  const sk = (kind) => SKINS[kind].filter((k) => k.test).map((k) => { const w = med((r) => r.out.skinAt[k.id]); return `${k.name} ${w == null ? `never for most (${pct((r) => r.out.skinAt[k.id] != null)} in 3 yrs)` : `wk ${w.toFixed(0)}`}`; }).join(", ");
  console.log(`  skins, median week unlocked: sky: ${sk("sky")}`);
  console.log(`                               core: ${sk("core")}`);
  const fixed = (r, wk) => Object.entries(r.out.skinAt).filter(([id, w]) => !id.startsWith("season") && w < wk).length;
  console.log(`  fixed skins owned (of 9): after year 1 ${avg((r) => fixed(r, 52)).toFixed(1)}, year 2 ${avg((r) => fixed(r, 104)).toFixed(1)}, year 3 ${avg((r) => fixed(r, 999)).toFixed(1)}`);
  console.log(`  limited season skins earned: ${[2026, 2027, 2028].map((y) => `${y}: ${pct((r) => r.out.skinAt["season-" + y] != null)}`).join(", ")}, median week of the season ${med((r) => r.out.skinAt["season-2026"])?.toFixed(0) ?? "-"}`);
  console.log(`  week of the season each rung lands (season 2, median): ${LADDER.map((t, i) => `${rungLabel(t)} ${med((r) => r.out.rungAt?.[`2027:${i}`])?.toFixed(1) ?? "-"}`).join(", ")}`);
  const at = (n) => LADDER.findIndex((r) => r.at === n);
  for (let y = 0; y < 3; y++) console.log(`  season ${y + 1} costly rewards: week of plan (14,000) ${pct((q) => q.out.years[y]?.doneList?.[at(14000)])}, free month (30,000) ${pct((q) => q.out.years[y]?.doneList?.[at(30000)])}, early access (10,000, automatic) ${pct((q) => q.out.years[y]?.doneList?.[at(10000)])}`);
  const drought = (r, y) => { const a = y * 365, b = a + 140; const d = [a, ...r.out.rewardDays.filter((x) => x >= a && x < b), b]; let m = 0; for (let i = 1; i < d.length; i++) m = Math.max(m, d[i] - d[i - 1]); return m / 7; };
  for (let y = 0; y < 3; y++) console.log(`  year ${y + 1} season (20 wks): longest stretch with no new rung, season reward or skin: median ${med((r) => drought(r, y)).toFixed(1)} wks, 1 in 4 members ${(() => { const v = runs.map((r) => drought(r, y)).sort((a, b) => a - b); return v[Math.floor(N * 0.75)].toFixed(1); })()} wks or more`);
  console.log(`  finds by tier % (small / comet / planet / shower / stellar): ${share(runs.reduce((a, r) => a.map((x, i) => x + r.out.finds[i]), [0, 0, 0, 0, 0]))}`);
  console.log(`  first 4 weeks of a season vs weeks 12-18 (tiers %): ${share(runs.reduce((a, r) => a.map((x, i) => x + r.out.earlyTiers[i]), [0, 0, 0, 0, 0]))}  vs  ${share(runs.reduce((a, r) => a.map((x, i) => x + r.out.lateTiers[i]), [0, 0, 0, 0, 0]))}`);
  console.log(`  weeks to first: comet ${med((r) => r.out.firstTier[2])?.toFixed(1)}, planet ${med((r) => r.out.firstTier[3])?.toFixed(1)}, stellar ${med((r) => r.out.firstTier[5])?.toFixed(1) ?? "most never (3 yrs)"}`);
  console.log(`  after 3 years: catalogue ${avg((r) => Object.keys(r.s.found).length).toFixed(0)} of ${CATALOGUE_SIZE}, sets ${avg((r) => Object.keys(r.s.sets).length).toFixed(0)} of ${SET_COUNT}, Beat the Model ${avg((r) => r.s.btm[0]).toFixed(0)}-${avg((r) => r.s.btm[1]).toFixed(0)}`);
  console.log(`  ever saw: stellar event ${pct((r) => r.out.finds[4] > 0)}, ancient ${pct((r) => r.out.vers[2] > 0)}, mythic ${pct((r) => r.out.vers[3] > 0)}; best season title over 3 seasons: ${["Spotter", "Charted", "Lookout", "Observer", "Tracker", "Surveyor", "Star-namer", "Event Horizon"].map((n) => `${n} ${pct((r) => r.out.years.map((y) => LADDER.map((t, i) => (y.doneList?.[i] && t.title) || null).filter(Boolean).at(-1) || "Spotter").includes(n) && !r.out.years.some((y) => { const idx = ["Spotter", "Charted", "Lookout", "Observer", "Tracker", "Surveyor", "Star-namer", "Event Horizon"]; const t = LADDER.map((q, i) => (y.doneList?.[i] && q.title) || null).filter(Boolean).at(-1) || "Spotter"; return idx.indexOf(t) > idx.indexOf(n); }))}`).join(", ")}`);
}
