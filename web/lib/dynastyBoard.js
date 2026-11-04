// The Dynasty Draft Board's rankings: scoring, ranges and the tier rule. Pure, so it is tested (test/dynastyBoard.test.mjs).
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
//   GROUP -- nobody inside has P >= 0.80 (4 times in 5)
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
export const GROUP_NAMES = ["Cornerstones", "Core", "Depth", "Fringe", "Deep"];
// how much of the shipped pool a view shows: the top 120 overall, the top 60 of one position
export const SHOW = { all: 120, position: 60 };

// The rows a view draws: scored for the format and mode, optionally one position, cut to SHOW.
export function boardRows(rows, { format, mode, pos }) {
  const L = scoreRows(pos && pos !== "ALL" ? rows.filter((r) => r.pos === pos) : rows, format, mode);
  return L.slice(0, pos && pos !== "ALL" ? SHOW.position : SHOW.all);
}

// the probit of each P above: Phi(z) = P
const Z_TIE = 0.1257, Z_TIER = 0.3853, Z_GROUP = 0.8416;

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

// Form arrow: his last FORM_GAMES games against his weighted level (the 34-game number the score uses). Up / down when the gap is
// FORM_DELTA points a game or more; needs at least FORM_MIN games. Display only: the score still reads the long memory.
export const FORM_GAMES = 8, FORM_MIN = 4, FORM_DELTA = 3;
export function formTrend(points, ppg) {
  if (!points || points.length < FORM_MIN || !Number.isFinite(ppg)) return null;
  const last = points.slice(-FORM_GAMES);
  const recent = last.reduce((a, b) => a + b, 0) / last.length, delta = recent - ppg;
  return { dir: delta >= FORM_DELTA ? "up" : delta <= -FORM_DELTA ? "down" : "flat", recent, delta, games: last.length };
}

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

// Scores, ranges (80%: 10th to 90th percentile) and sd for the chosen format and mode, best first.
export function scoreRows(rows, formatKey, modeKey) {
  const f = FORMATS[formatKey] || FORMATS["1qb"], m = MODES[modeKey] || MODES.contender;
  return rows
    .map((r) => {
      // a mode with `short` reads the 17-game production numbers (ppg, games, production score, sd); the row carries the ones in use
      const s = m.short && r.ppgS != null;
      const prod = s ? r[f.key + "S"] : r[f.key], sdProd = s ? r.sdProdS : r.sdProd;
      const score = m.prod * prod + m.age * r.ageValue;
      const sd = m.prod * sdProd;
      return { ...r, ppg: s ? r.ppgS : r.ppg, games: s ? r.gamesS : r.games, prod, score, sd, lo: score - 1.2816 * sd, hi: score + 1.2816 * sd };
    })
    .sort((a, b) => Math.round(b.score * 10) - Math.round(a.score * 10) || a.age - b.age || b.score - a.score || b.ppg - a.ppg); // same score as shown (1 decimal): the younger player first
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

// The one-paragraph read at the top of a player's profile: rules over his own numbers, nothing else (no opinion, no grade).
// `tied` = the other players in his Tied box, `ranks` = his overall rank in every format x mode (null when the pool is not the whole board).
export function profileRead({ p, mode, repl, tied, ranks }) {
  const m = MODES[mode], prodC = Math.max(0, m.prod * p.prod), ageC = Math.max(0, m.age * p.ageValue), tot = prodC + ageC || 1;
  const out = [];
  if (p.ppg < repl) out.push("Below replacement level on production, so his age is what keeps him on the board.");
  else {
    out.push(`Production is ${Math.round((prodC / tot) * 100)}% of his score and age ${Math.round((ageC / tot) * 100)}%.`);
    if (p.ageValue <= 3) out.push("Age is the drag; production carries him.");
    else if (p.ageValue >= 7.5 && p.prod < 5) out.push("Young for his position: age is doing much of the work.");
  }
  if (tied.length) {
    const names = tied.slice(0, 2).map((r) => r.name);
    out.push(`Can't be separated from ${names.join(" or ")}${tied.length > 2 ? ` and ${tied.length - 2} more` : ""}.`);
  }
  if (ranks?.length) {
    const lo = Math.min(...ranks), hi = Math.max(...ranks);
    out.push(hi - lo >= 5 ? `Ranks #${lo} to #${hi} depending on format and mode.` : "Holds his rank across formats and modes.");
  }
  return out.join(" ");
}

// L: scoreRows() output. Returns { groups, tiers, ties } as index ranges into L ([a, b] inclusive) -- groups hold tiers,
// tiers hold ties. Each tier carries `beat`: how often one of its players is really better than one of the next tier's
// (the next GROUP's when it ends a group, with `groupBreak`).
export function buildBoard(L) {
  if (!L.length) return { groups: [], tiers: [], ties: [] };
  const n = L.length, okG = okMatrix(L, Z_GROUP), okT = okMatrix(L, Z_TIER), okX = okMatrix(L, Z_TIE);
  const groups = [], tiers = [], ties = [];
  segment(L, okG, 0, n - 1).forEach((G, g) => {
    groups.push({ a: G[0], b: G[1], g });
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
