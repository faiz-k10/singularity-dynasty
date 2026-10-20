// Live win chance for one head-to-head fantasy matchup (My Team's matchup view and the dashboard's Win % column).
// Pure functions, no imports, unit-tested in test/winChance.test.mjs; the server runs the simulation
// (app/my-team/actions.js) and the browser reuses the per-player pieces to draw the lineups.
//
// Method: points already scored are locked in; points still to come are drawn for every starter whose game hasn't
// finished, and both lineups are summed a few thousand times. P(win) = share of draws my lineup comes out ahead
// (a tie counts half).
// - A player's full-game outcome is a split normal around his weekly projection (median): the left half reaches his
//   weekly floor at the 10th percentile, the right half his weekly ceiling at the 90th (since Oct 20 2026 the model's
//   weekly ceiling is calibrated so ~10% of real games beat it, like the floor -- model/projection_engine.R CEIL_Q;
//   before that it was beaten only ~4% of the time at QB/RB/TE and ~6% at WR and was read as the 96th / 94th).
// - A game in progress leaves only part of that outcome to come: with f = share of the 60 game minutes left (ESPN
//   period + clock), the remaining points are centred on f x median with a spread of sqrt(f) x the full-game spread
//   (scoring treated as spread evenly over the game, so variance shrinks in proportion to the time left).
// - Kickers, defenses and anyone our model doesn't project use a typical range for the position (est: true).
// - Players are independent (no QB-receiver stacking correlation) and draws are floored at 0; our projections use
//   the site's fixed scoring while live points are the league's own, the same mix the Proj column already uses.
// - The random stream is seeded, so the same inputs always give the same answer (no flicker between polls).

export const Z10 = 1.2816; // standard-normal z of the 10th / 90th percentile
// The ceiling is a 90th percentile at every position (see above); kept as a function so a position can differ again.
export const ceilZ = () => Z10;

// Typical weekly range (median / floor / ceiling) for a starter our model doesn't project.
export const DEFAULT_RANGES = {
  QB: { proj: 14, floor: 6, ceiling: 26 },
  RB: { proj: 7, floor: 1, ceiling: 18 },
  WR: { proj: 7, floor: 1, ceiling: 18 },
  TE: { proj: 5, floor: 0, ceiling: 14 },
  K: { proj: 8, floor: 3, ceiling: 14 },
  DEF: { proj: 7, floor: 0, ceiling: 16 },
};
const OTHER_RANGE = { proj: 6, floor: 1, ceiling: 14 }; // IDP and anything else

// Share of the game still to play: 1 before kickoff, 0 once final, null when unknown (no scoreboard / not on it).
// In progress: quarters left plus the clock (overtime counts against the same 60 minutes, so it's a sliver).
export function gameFractionLeft(game) {
  if (!game) return null;
  if (game.state === "pre") return 1;
  if (game.state === "post") return 0;
  if (game.state !== "in") return null;
  const period = Number(game.period);
  const clock = Number(game.clock); // seconds left in the period
  if (!Number.isFinite(period) || period < 1 || !Number.isFinite(clock)) return 0.5;
  const minsLeft = (period <= 4 ? (4 - period) * 15 : 0) + Math.max(0, clock) / 60;
  return Math.min(1, Math.max(0, minsLeft / 60));
}

// One lineup slot from a Sleeper matchup entry: starterIds/slots line up 1:1 (the league's non-bench
// roster_positions), infoFor(id) -> {name, pos, team, active} | null, projFor(name) -> {proj, floor, ceiling} | null,
// points = the entry's players_points. Empty slots ("0") stay in place so both sides line up slot by slot.
export function buildSide(starterIds, slots, infoFor, projFor, points) {
  return (starterIds || []).map((rawId, i) => {
    const slot = slots?.[i] || null;
    const id = rawId && rawId !== "0" ? String(rawId) : null;
    if (!id) return { id: null, slot };
    const info = infoFor(id) || {};
    const pos = info.pos || null;
    const p = projFor(info.name || "");
    let range;
    let est = false;
    let out = false;
    if (p && typeof p.proj === "number") {
      range = { proj: p.proj, floor: p.floor ?? null, ceiling: p.ceiling ?? null };
    } else if (info.active === false || !info.team) {
      range = { proj: 0, floor: 0, ceiling: 0 }; // inactive / IR / free agent: not playing
      out = true;
    } else {
      range = DEFAULT_RANGES[pos] || OTHER_RANGE;
      est = true;
    }
    const pts = points?.[id];
    return {
      id,
      slot,
      name: info.name || id,
      pos,
      team: info.team || null,
      proj: range.proj,
      floor: range.floor,
      ceiling: range.ceiling,
      ...(est ? { est: true } : {}),
      ...(out ? { out: true } : {}),
      pts: typeof pts === "number" ? pts : null,
    };
  });
}

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

// Spread of a full game around the median (missing floor/ceiling -> half the median either way).
function fullSpread(p) {
  const med = Math.max(0, p.proj || 0);
  const lo = typeof p.floor === "number" ? Math.max(0, med - p.floor) / Z10 : med * 0.5;
  const hi = typeof p.ceiling === "number" ? Math.max(0, p.ceiling - med) / ceilZ(p.pos) : med * 0.5;
  return { med, lo, hi };
}

// Where one starter stands: state "pre" | "in" | "post" | "bye" | "empty" | null (scoreboard unknown), pts on the
// board (null before kickoff / unknown, like the Points column), and the points still to come as a split normal
// {mid, sdLo, sdHi} plus its 10th-90th range for display.
export function playerOutlook(p, gameStates) {
  if (!p || !p.id) return { state: "empty", pts: null, frac: 0, mid: 0, sdLo: 0, sdHi: 0, lo: 0, hi: 0 };
  const known = gameStates && Object.keys(gameStates).length > 0;
  const game = known && p.team ? gameStates[p.team] : null;
  let state;
  let frac;
  if (!known) {
    state = null;
    frac = null;
  } else if (!game) {
    state = "bye"; // not on this week's board: bye or no team
    frac = 0;
  } else {
    state = game.state;
    frac = gameFractionLeft(game);
  }
  const { med, lo, hi } = fullSpread(p);
  const f = frac == null ? 1 : frac;
  const mid = f * med;
  const sdLo = Math.sqrt(f) * lo;
  const sdHi = Math.sqrt(f) * hi;
  const pts = state === "in" || state === "post" ? p.pts ?? 0 : state === "bye" ? 0 : null;
  return {
    state,
    detail: game?.detail || null,
    start: game?.start || null,
    pts,
    frac: f,
    mid,
    sdLo,
    sdHi,
    lo: Math.max(0, mid - Z10 * sdLo),
    hi: mid + Z10 * sdHi,
  };
}

// Totals for one lineup: points so far, projected final (points so far + the median still to come), and how many
// starters are yet to play / playing / done.
export function summarizeSide(side, gameStates) {
  const players = (side || []).map((p) => ({ ...p, outlook: playerOutlook(p, gameStates) }));
  let pts = 0;
  let toCome = 0;
  let yetToPlay = 0;
  let playing = 0;
  for (const p of players) {
    const o = p.outlook;
    if (o.state === "empty") continue;
    pts += o.pts ?? 0;
    toCome += o.mid;
    if (o.state === "pre" || o.state === null) yetToPlay++;
    else if (o.state === "in") playing++;
  }
  return { players, pts: round2(pts), projFinal: round1(pts + toCome), yetToPlay, playing };
}

// Seeded uniform PRNG (mulberry32) + Box-Muller normals.
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

// An allowance for what a projection can't see: a starter who has not played yet can be a late scratch (inactive, rested,
// hurt in warm-ups) and scores nothing -- about 3% of starters; one whose game is on can leave early -- about 1% of what
// is left. Without it a team a few points behind with two big names to play reads 99.7% and "Locked in"; with it the same
// team reads about 98%. An assumption, not a backtested number.
export const SCRATCH_PRE = 0.03;
export const SCRATCH_LIVE = 0.01;

// P(mine beats opp) from two summarizeSide() results. Returns a 0-1 number.
export function simulateWinChance(mine, opp, { draws = 5000, seed = 20261018 } = {}) {
  const live = (s) => s.players.map((p) => p.outlook).filter((o) => o.sdLo > 0 || o.sdHi > 0 || o.mid > 0);
  const a = live(mine);
  const b = live(opp);
  const base = mine.pts - opp.pts;
  if (!a.length && !b.length) return base > 0 ? 1 : base < 0 ? 0 : 0.5;
  const z = normals(seed);
  const u = rng(seed + 7919);
  const draw = (o) => {
    const n = z();
    const risk = o.state === "pre" || o.state === null ? SCRATCH_PRE : o.state === "in" ? SCRATCH_LIVE : 0;
    if (risk && u() < risk) return 0;
    return Math.max(0, o.mid + n * (n < 0 ? o.sdLo : o.sdHi));
  };
  let wins = 0;
  for (let i = 0; i < draws; i++) {
    let m = base;
    for (const o of a) m += draw(o);
    for (const o of b) m -= draw(o);
    wins += m > 0 ? 1 : m === 0 ? 0.5 : 0;
  }
  return wins / draws;
}

// The whole matchup: both sides' summaries plus the win chance (null when it can't be told: no lineups, or points are
// on the board but the scoreboard couldn't be read, so we can't tell who is still to play).
export function matchupOutlook(h2h, gameStates, opts) {
  if (!h2h?.mine?.length || !h2h?.opp?.length) return null;
  const mine = summarizeSide(h2h.mine, gameStates);
  const opp = summarizeSide(h2h.opp, gameStates);
  const known = gameStates && Object.keys(gameStates).length > 0;
  const anyPoints = [...h2h.mine, ...h2h.opp].some((p) => p.pts);
  const winChance = !known && anyPoints ? null : Math.round(simulateWinChance(mine, opp, opts) * 1000) / 1000;
  return { mine, opp, winChance };
}
