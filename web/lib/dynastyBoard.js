import { acquiringGm, coachFor } from "./teamStaff.js";

// The Dynasty Board's rankings: scoring, ranges and the tier rule. Pure, so it is tested (test/dynastyBoard.test.mjs).
//
// A player's dynasty score = prod x (production over replacement, 1-10, for the league format) + age x (age value, 1-10),
// with the weights set by the mode. Both inputs come from model/dynasty_value.R (see its header for how they are made).
//
// Every score carries an uncertainty: `sdProd` is how far the production number misses next season's PPG, out of sample,
// in score units (model/backtest_production_blend.R); age is a lookup, so it adds none. A player's score sd is
// prod x sdProd. From that, "how often is player i really better than player j" is P = Phi((si - sj) / sqrt(sdi^2 + sdj^2)),
// and the board is drawn from it with one rule at three strengths:
//   TIED  -- nobody inside a box has P >= 0.55 over anyone below him: the order inside is close to a coin flip
//   TIER  -- nobody inside has P >= 0.65 over anyone below him (about 2 times in 3)
//   GROUP -- nobody inside has P >= 0.70 (was 0.80 until Nov 16 2026, founder: more groups; 6-9 groups a view)
// (The error is large -- next-season PPG misses by 3-4 points a game -- so a stricter bar, 0.90 / 0.999, can only make a
// handful of huge boxes; 0.60 / 0.75 / 0.90 still gave only 3-5 tiers. These give 7-9 tiers overall, ~8 in a position, and
// the red "beat" figure on each break says how sure that break is.)
// Each level uses the FEWEST boxes the rule allows, and where several splits tie, the breaks go where the drops are biggest.

export const MODES = {
  contender: { label: "Contender", prod: 0.8, age: 0.2 },
  rebuilder: { label: "Rebuilder", prod: 0.5, age: 0.5, short: true }, // short: production from his last 17 games (Contender: 34)
};
export const FORMATS = {
  sf: { label: "Superflex", key: "porSf" },
  "1qb": { label: "1QB", key: "por1qb" },
};  // toggle order on the page: Superflex, 1QB (the page still opens on 1QB)
// group names (founder, Nov 16 2026), set by production over replacement (`prod`, 1.0 = a replacement starter's points a game):
// the groups above replacement level take ABOVE from the top, every player near replacement is ONE group, REPLACEMENT, and
// the groups below it take BELOW. A section with more groups than names reuses its last name.
export const GROUP_NAMES = { above: ["Future Legend", "Generational", "Hall of Famer", "The Franchise", "Cornerstone", "Core"], replacement: "Replacement", below: ["Depth", "Fringe", "Taxi Squad", "Waiver Wire"] };
const REPL_WINDOW = 9, REPL_LINE = 2.0, BELOW_LINE = 0.0; // local production = the median prod of the REPL_WINDOW players around him (1 point = 15/9 PPG): the replacement group is the band within ~1.7 points a game of replacement either side -- under 2 starts it, under 0 at the bottom is below it
// how much of the shipped pool a view shows: the top 300 overall, the top 120 of one position (founder, Nov 16 2026)
export const SHOW = { all: 300, position: 120 };

// The rows a view draws: scored for the format and mode, optionally one position, cut to SHOW.
export function boardRows(rows, { format, mode, pos }) {
  const all = scoreRows(rows, format, mode); // scored over everyone first, so the scale is the whole board's
  const L = pos && pos !== "ALL" ? all.filter((r) => r.pos === pos) : all;
  return L.slice(0, pos && pos !== "ALL" ? SHOW.position : SHOW.all);
}

// the probit of each P above: Phi(z) = P
const Z_TIE = 0.1257, Z_TIER = 0.3853, Z_GROUP = 0.5244;
const GROUP_MAX = 20; // a group this big or bigger is split again (buildBoard)
const GROUP_SPLIT_Z = [0.4677, 0.4399, 0.4125, Z_TIER]; // P 0.68, 0.67, 0.66, then the tier cut (0.65)

// A player is scored on the age he will be AGE_LOOKAHEAD years from now, on his position's age curve (founder, Nov 3 2026:
// a 24-year-old and a 32-year-old QB were nearly level on today's age, because QBs keep their production until about 31).
export const AGE_LOOKAHEAD = 3;

// age value ([age, age value, share kept] rows, sorted by age) at an age, straight lines between ages, held at the ends
export function ageValueAt(curve, age) {
  const a = Math.min(Math.max(age, curve[0][0]), curve.at(-1)[0]);
  for (let i = 0; i < curve.length - 1; i++) {
    if (a <= curve[i + 1][0]) return curve[i][1] + ((a - curve[i][0]) / (curve[i + 1][0] - curve[i][0])) * (curve[i + 1][1] - curve[i][1]);
  }
  return curve.at(-1)[1];
}

const drift = (ppg, vHi) => (Number.isFinite(ppg) && vHi ? (9 * ppg) / vHi : null);

// model/dynasty_value.R writes { columns, rows: [[...]] }; this makes row objects
export function rowsFromData(data) {
  const c = data.columns;
  const at = (n) => c.indexOf(n);
  return data.rows.map((r) => ({
    id: r[at("player_id")], name: r[at("player")], pos: r[at("position")], team: r[at("team")], age: r[at("age")],
    games: r[at("games_in_window")], ppg: r[at("ppg_weighted")],
    // the Rebuilder's production numbers (last 17 games); absent in an older data file, then scoreRows uses the long ones
    gamesS: r[at("games_s")], ppgS: r[at("ppg_s")], por1qbS: r[at("por_1qb_s")], porSfS: r[at("por_sf_s")], sdProdS: r[at("sd_prod_s")],
    ageValue: data.age_curve?.[r[at("position")]] ? ageValueAt(data.age_curve[r[at("position")]], r[at("age")] + AGE_LOOKAHEAD) : r[at("age_value")],
    por1qb: r[at("por_1qb")], porSf: r[at("por_sf")], sdProd: r[at("sd_prod")],
    // who drafted him (absent in an older data file: then the drafting-GM column reads "undrafted")
    draftTeam: at("draft_team") >= 0 ? r[at("draft_team")] : "", draftYear: at("draft_year") >= 0 ? r[at("draft_year")] : 0,
    // when a player who left his drafting team joined his current one, and how ("trade" / "joined")
    acqDate: at("acq_date") >= 0 ? r[at("acq_date")] : "", acqHow: at("acq_how") >= 0 ? r[at("acq_how")] : "",
    // drift: his production number now minus DRIFT games ago, in production-over-replacement points (null = too few games)
    driftPor: drift(r[at("drift")], data.v_hi), driftPorS: drift(r[at("drift_s")], data.v_hi), driftGames: data.drift_games || 0,
  }));
}

// What the player profile draws besides the rows: replacement PPG per format and position, the top of the production scale,
// the per-position age curve ([age, age value, share of production kept over the next 3 seasons]) and the memory settings.
export function metaFromData(data) {
  return {
    built: data.built, window: data.window, windowShort: data.window_short || data.window, vHi: data.v_hi,
    replacement: data.replacement, replacementShort: data.replacement_short || data.replacement, ageCurve: data.age_curve,
  };
}

// Standard normal CDF (Abramowitz-Stegun 7.1.26 on erf, |error| < 1.5e-7).
export function phi(z) {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

// Tiebreak between players with the same score as shown (founder, Nov 16 2026). The two context columns may ONLY break ties: they
// add nothing to next-season points once production and age are known (model/backtest_staff_context.R), so they never move a
// score. Head coach was an OC AND the GM who got him is still there = 3, head coach was an OC = 2, GM still there = 1, neither = 0.
export function staffTiebreak(r) {
  const oc = !!coachFor(r.team)?.oc, gm = acquiringGm(r).state === "yes";
  return oc && gm ? 3 : oc ? 2 : gm ? 1 : 0;
}

// Scores, ranges (80%: 10th to 90th percentile) and sd for the chosen format and mode, best first.
// RELATIVE (founder, Nov 16 2026: "rescale it, dynasty rankings are always relative"): the recipe (prod x weight + age x weight)
// gives `raw`; every score, sd and range is then multiplied by `scale` = 10 / the best raw score among the rows passed in, so the
// best player on the board reads 10.0. A plain multiplication: order, tiers (they read score gaps over sd) and ties are unchanged.
// Pass the WHOLE pool (boardRows filters positions after scoring), or the top of a position would read 10 too.
export function scoreRows(rows, formatKey, modeKey) {
  const f = FORMATS[formatKey] || FORMATS["1qb"], m = MODES[modeKey] || MODES.contender;
  const raw = rows.map((r) => {
    // a mode with `short` reads the 17-game production numbers (ppg, games, production score, sd); the row carries the ones in use
    const s = m.short && r.ppgS != null;
    const prod = s ? r[f.key + "S"] : r[f.key], sdProd = s ? r.sdProdS : r.sdProd, dp = s ? r.driftPorS : r.driftPor;
    return { r, s, prod, raw: m.prod * prod + m.age * r.ageValue, rawSd: m.prod * sdProd, rawMove: dp == null ? null : m.prod * dp };
  });
  const top = Math.max(...raw.map((x) => x.raw));
  const scale = top > 0 ? 10 / top : 1;
  return raw
    .map(({ r, s, prod, raw: rs, rawSd, rawMove }) => {
      const score = rs * scale, sd = rawSd * scale;
      // move: how much his score has changed over his last driftGames games from production alone (age held), in score points
      const move = rawMove == null ? null : rawMove * scale;
      return { ...r, ppg: s ? r.ppgS : r.ppg, games: s ? r.gamesS : r.games, prod, raw: rs, scale, score, sd, lo: score - 1.2816 * sd, hi: score + 1.2816 * sd, move };
    })
    // same score as shown (1 decimal): first the staff tiebreak (staffTiebreak), then the player earlier on his own position's age curve
    // (higher age value = more years at this level), then the younger
    .sort((a, b) => Math.round(b.score * 10) - Math.round(a.score * 10) || staffTiebreak(b) - staffTiebreak(a) || b.ageValue - a.ageValue || a.age - b.age || b.score - a.score || b.ppg - a.ppg);
}

// Each player's overall rank, position rank and score in every format x mode, counted over the WHOLE pool (the profile's
// rank matrix; worked out on the server so a viewer shown only part of the board still sees true ranks).
export function rankGrid(rows) {
  const out = new Map(rows.map((r) => [r.id, {}]));
  for (const fk of Object.keys(FORMATS)) for (const mk of Object.keys(MODES)) {
    const pos = {};
    scoreRows(rows, fk, mk).forEach((r, i) => {
      pos[r.pos] = (pos[r.pos] || 0) + 1;
      out.get(r.id)[`${fk}:${mk}`] = { rank: i + 1, posRank: pos[r.pos], score: r.score };
    });
  }
  return out;
}

// z of "row i beats row j" for i above j (sorted best first)
const zOf = (L, i, j) => (L[i].score - L[j].score) / Math.hypot(L[i].sd, L[j].sd);

// ok[a * n + e] = no pair inside a..e has z >= zt. A box is fine iff its two sub-boxes are and its ends are.
function okMatrix(L, zt) {
  const n = L.length, ok = new Uint8Array(n * n);
  for (let a = 0; a < n; a++) ok[a * n + a] = 1;
  for (let len = 2; len <= n; len++) {
    for (let a = 0; a + len - 1 < n; a++) {
      const e = a + len - 1;
      ok[a * n + e] = ok[(a + 1) * n + e] && ok[a * n + e - 1] && zOf(L, a, e) < zt ? 1 : 0;
    }
  }
  return ok;
}

// Fewest contiguous boxes over lo..hi with no violating pair inside; ties broken by the largest sum of z at the breaks.
function segment(L, ok, lo, hi) {
  const n = L.length, best = [{ c: 0, s: 0, cut: -1 }];
  for (let e = lo; e <= hi; e++) {
    let bb = null;
    for (let a = e; a >= lo; a--) {
      if (!ok[a * n + e]) break;
      const pv = best[a - lo], c = pv.c + 1, s = pv.s + (a > lo ? zOf(L, a - 1, a) : 0);
      if (!bb || c < bb.c || (c === bb.c && s > bb.s)) bb = { c, s, cut: a };
    }
    best.push(bb);
  }
  const out = [];
  for (let e = hi; e >= lo; ) {
    const a = best[e - lo + 1].cut;
    out.unshift([a, e]);
    e = a - 1;
  }
  return out;
}

// average P(a player of box A beats a player of box B), A above B
const superiority = (L, A, B) => {
  let s = 0, c = 0;
  for (let i = A[0]; i <= A[1]; i++) for (let j = B[0]; j <= B[1]; j++) { s += phi(zOf(L, i, j)); c++; }
  return s / c;
};

// How often player a is really better than player b (scoreRows() rows): Phi of the score gap over both errors.
export const pBetter = (a, b) => phi((a.score - b.score) / Math.hypot(a.sd, b.sd));

// L: scoreRows() output. Returns { groups, tiers, ties } as index ranges into L ([a, b] inclusive) -- groups hold tiers,
// tiers hold ties. Each tier carries `beat`: how often one of its players is really better than one of the next tier's
// (the next GROUP's when it ends a group, with `groupBreak`).
export function buildBoard(L) {
  if (!L.length) return { groups: [], tiers: [], ties: [] };
  const n = L.length, okG = okMatrix(L, Z_GROUP), okT = okMatrix(L, Z_TIER), okX = okMatrix(L, Z_TIE);
  const groups = [], tiers = [], ties = [];
  // a group of GROUP_MAX or more ABOVE replacement level is split again (founder, Nov 16 2026: "groups of 20 or more should be split up more"): the same
  // rule with a looser cut, step by step down to the tier cut; still too big there, it is cut at its widest score gap
  const okAt = new Map();
  const ok = (z) => { if (!okAt.has(z)) okAt.set(z, okMatrix(L, z)); return okAt.get(z); };
  const split = ([a, b]) => {
    if (b - a + 1 < GROUP_MAX) return [[a, b]];
    for (const z of GROUP_SPLIT_Z) {
      const parts = segment(L, ok(z), a, b);
      if (parts.length > 1) return parts.flatMap(split);
    }
    let cut = a; // the widest gap between neighbours, kept away from the ends so neither side is a sliver
    for (let k = a + 4; k < b - 4; k++) if (zOf(L, k, k + 1) > zOf(L, cut, cut + 1) || cut === a) cut = k;
    return [[a, cut], [cut + 1, b]].flatMap(split);
  };
  // REPLACEMENT FIRST (founder, Nov 16 2026: "start with labeling the players who score just at or above and just below replacement
  // level as REPLACEMENT, then rank the rest into the groups"): walking down the list, each player's local production is the median
  // prod of the REPL_WINDOW players around him; Replacement runs from the first player whose local production is under REPL_LINE to
  // the last whose is still at or over BELOW_LINE (the band within ~1.7 points a game of replacement, either side). The players
  // above it are grouped (and split for size), the players below it are grouped into the BELOW names.
  const half = Math.floor(REPL_WINDOW / 2);
  const local = L.map((_, i) => {
    const v = L.slice(Math.max(0, i - half), i + half + 1).map((r) => r.prod).sort((x, y) => x - y);
    return v[Math.floor(v.length / 2)];
  });
  let start = local.findIndex((v) => v < REPL_LINE);
  if (start < 0) start = n;
  let end = n - 1;
  while (end >= start && !(local[end] >= BELOW_LINE)) end--;
  const above = start > 0 ? segment(L, okG, 0, start - 1).flatMap(split) : []; // only groups ABOVE replacement are split for size
  // more groups above replacement than names: merge the neighbours with the weakest break, as long as the result stays under GROUP_MAX
  // (what still doesn't fit reuses the last name, Core)
  while (above.length > GROUP_NAMES.above.length) {
    let k = -1, weakest = Infinity;
    for (let j = 2; j + 1 < above.length; j++) { // the top two (Future Legend, Generational) are never merged
      if (above[j + 1][1] - above[j][0] + 1 >= GROUP_MAX) continue;
      const sup = superiority(L, above[j], above[j + 1]);
      if (sup < weakest) { weakest = sup; k = j; }
    }
    if (k < 0) break;
    above.splice(k, 2, [above[k][0], above[k + 1][1]]);
  }
  // below replacement: at most one group per name, merging the neighbours with the weakest break (any size)
  const under = end + 1 < n ? segment(L, okG, end + 1, n - 1) : [];
  while (under.length > GROUP_NAMES.below.length) {
    let k = 0, weakest = Infinity;
    for (let j = 0; j + 1 < under.length; j++) { const sup = superiority(L, under[j], under[j + 1]); if (sup < weakest) { weakest = sup; k = j; } }
    under.splice(k, 2, [under[k][0], under[k + 1][1]]);
  }
  const named = (list, names) => list.map((G, k) => [G, names[Math.min(k, names.length - 1)]]);
  [
    ...named(above, GROUP_NAMES.above),
    ...(end >= start ? [[[start, end], GROUP_NAMES.replacement]] : []),
    ...named(under, GROUP_NAMES.below),
  ].forEach(([G, name], g) => {
    groups.push({ a: G[0], b: G[1], g, name });
    segment(L, okT, G[0], G[1]).forEach((T) => {
      const ti = tiers.length;
      tiers.push({ a: T[0], b: T[1], g, ti });
      segment(L, okX, T[0], T[1]).forEach((X) => ties.push({ a: X[0], b: X[1], ti }));
    });
  });
  tiers.forEach((t, i) => {
    const nx = tiers[i + 1];
    if (!nx) return;
    t.groupBreak = nx.g !== t.g;
    t.beat = t.groupBreak ? superiority(L, [groups[t.g].a, groups[t.g].b], [groups[nx.g].a, groups[nx.g].b]) : superiority(L, [t.a, t.b], [nx.a, nx.b]);
  });
  return { groups, tiers, ties };
}
