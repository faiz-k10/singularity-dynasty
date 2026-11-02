import { FLAG_MIN_SCORE } from "./defenseLeans.js";

// This week's Smash Spots and Tough Spots as one list for the share card (/smash): every defense-vs-position trend strong enough to be
// flagged on Weekly Projection Rankings that someone actually faces this week, with the offense's top projected players at that position.
// Free depth only: players are named only from the free top 50 (FREE_RANK), so the card never shows what the paywall protects; a matchup
// whose players are all deeper still shows as "KC WRs". Pure; tested in test/smashSpots.test.mjs.

export const FREE_RANK = 50;

// rankRows: this week's redraft_rankings (player_name, position, team, opponent, projection, rank); leanRows: the leans shown this week.
export function smashSpots({ rankRows, leanRows }) {
  const out = [];
  for (const l of leanRows || []) {
    if (!(l.score >= FLAG_MIN_SCORE)) continue;
    const facing = (rankRows || []).filter((r) => r.opponent === l.defense && r.position === l.position && r.projection > 0);
    if (!facing.length) continue; // a bye, or no ranked player faces it
    facing.sort((a, b) => b.projection - a.projection);
    out.push({
      call: l.call === "SMASH" ? "SMASH" : "AVOID",
      defense: l.defense,
      position: l.position,
      offense: facing[0].team,
      effect: Math.round(Number(l.effect) * 10) / 10,
      score: Number(l.score),
      players: facing.filter((r) => r.rank != null && r.rank <= FREE_RANK).slice(0, 2).map((r) => ({ name: r.player_name, projection: r.projection })),
    });
  }
  const smash = out.filter((s) => s.call === "SMASH").sort((a, b) => b.effect - a.effect);
  const tough = out.filter((s) => s.call === "AVOID").sort((a, b) => a.effect - b.effect);
  return { smash, tough };
}

const signed = (v) => `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
const spotLine = (s) => `${s.offense} ${s.position}s vs ${s.defense} (${signed(s.effect)})`;

// The card's title, description and post caption.
export function smashWords(d) {
  const top = d.smash.slice(0, 3).map(spotLine).join(", ");
  return {
    title: `Week ${d.week} Smash Spots${d.smash[0] ? `: ${spotLine(d.smash[0])}` : ""}`,
    description: `${d.smash.length} Smash Spots and ${d.tough.length} Tough Spots this week: the strongest defense-vs-position trends, opponent-adjusted, in fantasy points a game.`,
    caption: `Week ${d.week} Smash Spots: ${top || "none this week"}.${d.tough[0] ? ` Toughest: ${spotLine(d.tough[0])}.` : ""}`,
  };
}
