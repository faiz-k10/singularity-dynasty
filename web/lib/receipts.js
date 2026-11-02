import { normalizePlayerName } from "./portfolio.js";
import { indexLeans, flagFor } from "./defenseLeans.js";
import { round1 } from "./format.js";

// "Receipts": how last week's published numbers did against what really happened -- the weekly track-record card (/receipts). Proof is the
// product's pitch, so the card says it as it is, good week or bad. Pure; tested in test/receipts.test.mjs.
//
// The pool is every player we projected for 5+ points (starter level; the same cut as the win-chance backtest) who has a game that week in
// player_game_log (a real stat line or a 0.0 with snaps). Players who didn't play are left out -- the range is for a player who plays.
// The weekly floor is the 10th percentile and the ceiling the 90th, so in a normal week ~10% land under the floor, ~10% over the ceiling
// and ~80% in between. Smash / Tough Spots are the flags as they were shown that week (the leans published through the week before).

export const RECEIPT_MIN_PROJ = 5;
export const TARGET = { over: 10, under: 10, inside: 80 };

const key = (name, pos) => `${normalizePlayerName(name)}|${pos}`;
const pctOf = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const avg = (xs) => (xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

// rankRows: that week's redraft_rankings (player_name, position, team, opponent, projection, floor, ceiling)
// games: player_game_log rows of that week (player_name, position, fantasy_points_ppr)
// leanRows: defense_leans as they were shown that week
export function weekReceipts({ rankRows, games, leanRows }) {
  const actual = new Map();
  for (const g of games || []) if (g.fantasy_points_ppr != null) actual.set(key(g.player_name, g.position), Number(g.fantasy_points_ppr));
  const leans = indexLeans(leanRows);
  const pool = [];
  for (const r of rankRows || []) {
    if (!(r.projection >= RECEIPT_MIN_PROJ) || r.floor == null || r.ceiling == null) continue;
    const pts = actual.get(key(r.player_name, r.position));
    if (pts == null) continue;
    const flag = flagFor(leans, r.opponent, r.position);
    pool.push({ name: r.player_name, pos: r.position, team: r.team, opponent: r.opponent, proj: r.projection, floor: r.floor, ceiling: r.ceiling, pts, call: flag?.call || null });
  }
  const over = pool.filter((p) => p.pts > p.ceiling);
  const under = pool.filter((p) => p.pts < p.floor);
  const spot = (call) => {
    const list = pool.filter((p) => p.call === call);
    return {
      n: list.length,
      vsMedian: avg(list.map((p) => p.pts - p.proj)),
      // a Smash Spot "hits" when he beats his median; a Tough Spot when he falls short of it
      hits: list.filter((p) => (call === "SMASH" ? p.pts > p.proj : p.pts < p.proj)).length,
      best: [...list].sort((a, b) => (call === "SMASH" ? b.pts - b.proj - (a.pts - a.proj) : a.pts - a.proj - (b.pts - b.proj))).slice(0, 3),
    };
  };
  return {
    n: pool.length,
    over: { n: over.length, pct: pctOf(over.length, pool.length) },
    under: { n: under.length, pct: pctOf(under.length, pool.length) },
    inside: { n: pool.length - over.length - under.length, pct: pctOf(pool.length - over.length - under.length, pool.length) },
    medianError: (() => {
      const e = pool.map((p) => Math.abs(p.pts - p.proj)).sort((a, b) => a - b);
      return e.length ? round1(e[Math.floor(e.length / 2)]) : null;
    })(),
    smash: spot("SMASH"),
    tough: spot("AVOID"),
    // the biggest ceiling games -- the range said they could happen
    ceilingGames: [...over].sort((a, b) => b.pts - b.ceiling - (a.pts - a.ceiling)).slice(0, 3),
  };
}

// One plain-English line on the range, for the card and its caption.
export function rangeVerdict(r) {
  if (!r?.n) return "";
  const close = (v, t) => Math.abs(v - t) <= 4;
  if (close(r.over.pct, TARGET.over) && close(r.under.pct, TARGET.under)) return "The ranges ran right on target.";
  if (r.over.pct > TARGET.over + 4) return "A big week for ceilings: more players beat their range than usual.";
  if (r.under.pct > TARGET.under + 4) return "A rough week: more players finished under their floor than usual.";
  return "A quiet week: fewer players than usual left their range.";
}

const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);

// The card's title, description and post caption, from its numbers.
export function receiptsWords(r) {
  const title = `Week ${r.week} receipts: ${pct(r.inside.pct)} inside the range, ${pct(r.over.pct)} beat the ceiling`;
  const spot = r.smash.n ? ` Smash Spots: ${r.smash.hits} of ${r.smash.n} beat their median.` : "";
  return {
    title,
    description: `${r.n} players projected for 5+ points: ${pct(r.inside.pct)} landed inside our floor-to-ceiling range (aim ${TARGET.inside}%), ${pct(r.over.pct)} beat the ceiling and ${pct(r.under.pct)} fell under the floor (aim ${TARGET.over}% each).${spot}`,
    caption: `Week ${r.week} receipts: ${pct(r.inside.pct)} of players landed inside our range, ${pct(r.over.pct)} beat the ceiling (we aim for ${TARGET.over}%).${spot} ${rangeVerdict(r)}`,
  };
}
