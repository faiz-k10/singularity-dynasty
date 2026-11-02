// The Lab's arithmetic (app/tools/lab): season-so-far numbers from a game log, percentiles within a position, a least-squares line with its
// correlation, axis ticks, and the weekly series the game-log chart draws. Pure; tested in test/labCalc.test.mjs.
import { rankIn } from "./rank.js";
import { round1 } from "./format.js";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Population standard deviation (the spread of the games he actually played, not an estimate of something larger).
export function stdDev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

// A player's season so far from his games, oldest first: [[week, points, xfp|null, opponent], ...].
// Spread needs 3 games to mean anything; points over expected uses only the games that have an expected-points value.
export function seasonLine(games) {
  const pts = (games || []).map((g) => g[1]).filter(isNum);
  if (!pts.length) return {};
  const withX = (games || []).filter((g) => isNum(g[1]) && isNum(g[2]));
  const total = pts.reduce((a, b) => a + b, 0);
  const sd = pts.length >= 3 ? stdDev(pts) : null;
  return {
    gp: pts.length,
    total: round1(total),
    ppg: r2(total / pts.length),
    l3: r2(mean(pts.slice(-3))),
    best: round1(Math.max(...pts)),
    ...(sd != null ? { sd: r2(sd) } : {}),
    ...(withX.length ? { fpoe: r2(mean(withX.map((g) => g[1] - g[2]))) } : {}),
  };
}

// { name: { key: 0-100 } }: where each value sits among the same position's values for that key (100 = best, so a lower-is-better key is
// flipped). rows: [{ name, pos, m: { key: value } }]; keys: [{ key, lower }].
export function percentiles(rows, keys) {
  const out = {};
  for (const { key, lower } of keys) {
    const pools = {};
    for (const r of rows) if (isNum(r.m[key])) (pools[r.pos] ??= []).push(r.m[key]);
    for (const r of rows) {
      const v = r.m[key];
      const pool = pools[r.pos];
      if (!isNum(v) || !pool) continue;
      const of = pool.length;
      const rank = rankIn(pool, v, lower);
      (out[r.name] ??= {})[key] = of > 1 ? Math.round(((of - rank) / (of - 1)) * 100) : 100;
    }
  }
  return out;
}

// Least squares y = slope * x + intercept, with Pearson's r. Null with fewer than 3 points or no spread on either axis.
export function linearFit(points) {
  const n = points.length;
  if (n < 3) return null;
  const mx = mean(points.map((p) => p[0]));
  const my = mean(points.map((p) => p[1]));
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  if (sxx === 0 || syy === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy), n };
}

// Plain words for a correlation (the usual rule-of-thumb bands).
export function corrWord(r) {
  const a = Math.abs(r);
  const dir = r > 0 ? "positive" : "negative";
  if (a < 0.1) return "no clear link";
  if (a < 0.3) return `weak ${dir}`;
  if (a < 0.5) return `moderate ${dir}`;
  if (a < 0.7) return `strong ${dir}`;
  return `very strong ${dir}`;
}

// About `count` round tick values covering lo..hi (steps of 1, 2, 2.5 or 5 x a power of ten); the first and last tick enclose the range.
export function niceTicks(lo, hi, count = 5) {
  if (!isNum(lo) || !isNum(hi)) return [0, 1];
  if (lo === hi) {
    const pad = Math.abs(lo) > 0 ? Math.abs(lo) * 0.1 : 1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) || 10 * mag;
  const start = Math.floor(lo / step) * step;
  const ticks = [];
  for (let v = start; v < hi + step * 0.5; v += step) {
    ticks.push(Number(v.toFixed(10)));
    if (ticks.length > 50) break;
  }
  if (ticks[ticks.length - 1] < hi) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(10)));
  return ticks;
}

// Mean of the last `n` values (fewer at the start), one per value.
export function rolling(values, n) {
  return values.map((_, i) => mean(values.slice(Math.max(0, i - n + 1), i + 1)));
}

// The game-log chart's points for one player: [{ week, value, opp }] in week order. kind: "pts" (PPR points), "xfp" (expected points),
// "fpoe" (points minus expected). `smooth` replaces each value with the mean of his last 3 games (by games played, not weeks).
export function weeklySeries(games, kind, smooth = false) {
  const pick = { pts: (g) => g[1], xfp: (g) => g[2], fpoe: (g) => (isNum(g[1]) && isNum(g[2]) ? g[1] - g[2] : null) }[kind] || ((g) => g[1]);
  const pts = (games || []).map((g) => ({ week: g[0], value: pick(g), opp: g[3] ?? null })).filter((p) => isNum(p.value));
  if (!smooth) return pts;
  const avg = rolling(pts.map((p) => p.value), 3);
  return pts.map((p, i) => ({ ...p, value: avg[i] }));
}
