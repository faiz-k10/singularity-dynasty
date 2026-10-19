// One word for where a matchup stands, from the win chance -- shared by the Sunday board cards and this panel so the
// colour and the headline mean the same thing everywhere (gold = going your way, blue = not, plain = too close).
export function standing(pct, done, ahead = null) {
  if (pct == null) return { key: "none", label: null };
  if (done) return pct >= 0.5 ? { key: "won", label: "Won" } : { key: "lost", label: "Lost" };
  // "Locked in" / "Out of reach" are claims that it is over, so they need the score to agree: a team that is still BEHIND on the
  // board is at most "Favored" however high the simulation says (an injury or a bust can still happen), and the mirror for
  // "Out of reach". `ahead`: true = currently leading, false = trailing, null = level or unknown.
  if (pct >= 0.995 && ahead !== false) return { key: "ahead", label: "Locked in" };
  if (pct <= 0.005 && ahead !== true) return { key: "behind", label: "Out of reach" };
  if (pct >= 0.6) return { key: "ahead", label: "Favored" };
  if (pct <= 0.4) return { key: "behind", label: "Underdog" };
  return { key: "close", label: "Toss-up" };
}

