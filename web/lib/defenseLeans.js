// Defense-vs-position matchup flags for Weekly Projection Rankings. Display only: the leans
// (model/defense_impact.R -> table defense_leans) are NOT inputs to any projection. A flag appears beside a
// player's opponent when that defense has one of the strongest trends against his position.
import { ordinal } from "./format.js";

// Only leans scoring at least this are flagged (tier 1 = 3.0+). Lower it to 2.5 to include tier 2.
export const FLAG_MIN_SCORE = 3.0;

const POS_NAME = { QB: "QB", RB: "RB", WR: "WR", TE: "TE" };

// rows: defense_leans rows. Returns a Map keyed "DEF|POS".
export function indexLeans(rows) {
  const m = new Map();
  for (const r of rows || []) m.set(`${r.defense}|${r.position}`, r);
  return m;
}

// The flag for one player's matchup, or null: { call: "SMASH" | "AVOID", text, effect (points a game vs an average defense) }.
export function flagFor(leans, opponent, position, minScore = FLAG_MIN_SCORE) {
  if (!leans || !opponent) return null;
  const l = leans.get(`${opponent}|${position}`);
  if (!l || !(l.score >= minScore)) return null;
  const pos = POS_NAME[position] || position;
  const pts = `${l.effect > 0 ? "+" : "−"}${Math.abs(l.effect).toFixed(1)}`;
  const smash = l.call === "SMASH";
  // rank_now: 1 = most generous of 32, so a stingy defense's "stingiest" rank is 33 - rank.
  const nowRank = smash ? l.rank_now : 33 - l.rank_now;
  const priorRank = l.rank_prior == null ? null : smash ? l.rank_prior : 33 - l.rank_prior;
  const word = smash ? "most generous" : "stingiest";
  const prior = priorRank != null && priorRank <= 12 ? `, and ${ordinal(priorRank)} ${word} last season too` : "";
  const text = smash
    ? `Smash spot: ${l.defense} has been giving up ${pos} scoring (${pts} pts/game vs. an average defense), ${ordinal(nowRank)} ${word} this season${prior}. A trend to weigh, not part of the projection.`
    : `Tough spot: ${l.defense} has been shutting down ${pos} scoring (${pts} pts/game vs. an average defense), ${ordinal(nowRank)} ${word} this season${prior}. A trend to weigh, not part of the projection.`;
  return { call: smash ? "SMASH" : "AVOID", text, effect: Number(l.effect) };
}
