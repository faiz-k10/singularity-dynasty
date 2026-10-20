// One matchup (a saved league's settings) with the plays Sleeper hasn't posted yet added in (lib/liveFeed.js pendingFor /
// applyPendingToLineup): each lineup's points, the two team totals Sleeper reports, and the win chance recomputed from those
// adjusted lineups (lib/winChance.js) so the percentage and the scores always agree. With nothing pending it hands back the
// server's numbers untouched (its win chance included). Used by the Sunday board's cards, caption and filters and by the open
// matchup panel, so every number on the board is on the same clock.
import { applyPendingToLineup } from "./liveFeed.js";
import { summarizeSide, matchupOutlook } from "./winChance.js";

const r2 = (v) => Math.round(v * 100) / 100;

// s: a saved team's settings ({ h2h, matchupActual, winChance }). Returns null for best ball / no lineups.
export function adjustedMatchup(s, gameStates, playTotals) {
  if (!s?.h2h?.mine || !s?.h2h?.opp) return null;
  const am = applyPendingToLineup(s.h2h.mine, playTotals);
  const ao = applyPendingToLineup(s.h2h.opp, playTotals);
  const mine = summarizeSide(am.list, gameStates);
  const opp = summarizeSide(ao.list, gameStates);
  const live = s.matchupActual ? { mine: r2(s.matchupActual.mine + am.added), opp: r2(s.matchupActual.opp + ao.added) } : null;
  const changed = am.added !== 0 || ao.added !== 0;
  const recomputed = changed ? matchupOutlook({ mine: am.list, opp: ao.list }, gameStates)?.winChance : undefined;
  return {
    mine,
    opp,
    live,
    winChance: recomputed !== undefined ? recomputed : s.winChance ?? null,
    added: { mine: am.added, opp: ao.added },
  };
}
