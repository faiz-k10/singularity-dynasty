// Season points under the shipped rules (web/lib/nightSky.js, incl. the Nov 19 2026 forecast days).
// Profiles: p = chance each possible action happens on a given day (7 tool actions + the daily share + the weekly picks).
import { freshState, award, gradePicks, eventFor, DAY } from "../web/lib/nightSky.js";
const ACTIONS = ["board", "waivers", "rankings", "compare", "sims", "lab", "dynasty"];
const seasonStart = (y) => Date.UTC(y, 8, 9);
const weekOf = (t) => { const y = new Date(t).getUTCMonth() >= 2 ? new Date(t).getUTCFullYear() : new Date(t).getUTCFullYear() - 1; const w = Math.floor((t - seasonStart(y)) / (7 * DAY)) + 1; return w >= 1 && w <= 18 ? w : 0; };
const seasonOf = (t) => { const d = new Date(t); return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
const skyOf = (t) => { const d = new Date(t); return d.getUTCMonth() >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
const inSeason = (t) => weekOf(t) > 0 || new Date(t).getUTCMonth() === 0;
const START = Date.UTC(2026, 8, 1);
function run({ pIn, pOff, share, picks }) {
  const s = freshState(); const pts = []; let yr = null, base = 0, stars = 0, starsBase = 0; const st = [];
  for (let t = START; t < START + 3 * 365 * DAY; t += DAY) {
    if (skyOf(t) !== yr) { if (yr != null) { pts.push(s.points - base); st.push(stars - starsBase); } yr = skyOf(t); base = s.points; starsBase = stars; }
    const week = weekOf(t), date = new Date(t), day = date.toISOString().slice(0, 10), season = seasonOf(t);
    const ctx0 = { day, event: eventFor(date, week), season, skySeason: skyOf(t) };
    const p = inSeason(t) ? pIn : pOff;
    const todays = ACTIONS.filter(() => Math.random() < p);
    if (Math.random() < share * (inSeason(t) ? 1 : pOff / Math.max(pIn, 1e-9))) todays.push("share");
    todays.forEach((a, i) => { const r = award(s, a, { ...ctx0, now: t + 20 * 3600e3 + i * 180e3 }, Math.random); stars += r?.placed?.length ?? r?.stars ?? 0; });
    s.pending = []; s.log = [];
    if (week && date.getUTCDay() === 2 && Math.random() < picks) {
      const key = `${season}-${week}`, P = {};
      const pairs = [0, 1, 2].map((i) => { const a = `a${i}`, b = `b${i}`; const right = Math.random() < 0.55; P[a] = right ? 10 : 5; P[b] = right ? 5 : 10; return { a, b }; });
      s.picks[key] = { season, week, pairs, choice: [0, 0, 0], graded: false };
      gradePicks(s, key, P, { day, now: t + 6 * DAY, season }, Math.random); delete s.picks[key];
    }
  }
  pts.push(s.points - base);
  return pts.slice(0, 3);
}
const PROF = {
  "Perfect (100%)": { pIn: 1, pOff: 1, share: 1, picks: 1 },
  "95% of everything": { pIn: 0.95, pOff: 0.95, share: 0.95, picks: 0.95 },
  "90% of everything": { pIn: 0.9, pOff: 0.9, share: 0.9, picks: 0.9 },
  "Engaged (6/day)": { pIn: 6 / 7, pOff: 3 / 7, share: 0, picks: 1 },
  "Upper regular (4/day)": { pIn: 4 / 7, pOff: 1.6 / 7, share: 0, picks: 1 },
  "Regular (3/day)": { pIn: 3 / 7, pOff: 1.05 / 7, share: 0, picks: 1 },
};
const N = Number(process.env.N || 300);
for (const [k, prof] of Object.entries(PROF)) {
  const all = Array.from({ length: N }, () => run(prof));
  const q = (y, p) => { const v = all.map((r) => r[y]).sort((a, b) => a - b); return Math.round(v[Math.floor((N - 1) * p)]); };
  console.log(k.padEnd(24), [0, 1, 2].map((y) => `S${y + 1}: p5 ${q(y, .05)} p25 ${q(y, .25)} med ${q(y, .5)} p75 ${q(y, .75)} max ${q(y, 1)}`).join(" | "));
}
