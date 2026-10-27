// Where one saved league's matchup stands right now, derived ONCE per league and shared by everything that shows it: the Game Board's
// cards, its header sentence and filters, the open matchup panel and the Companion. Built on adjustedMatchup (the plays Sleeper hasn't
// posted yet added in), so every one of them is on the same clock. A bye has no win chance and no lock.
import { adjustedMatchup } from "./adjustedMatchup.js";
import { lockIn, standing } from "./standing.js";

// s: a saved team's settings. Returns { adj, mine, opp, live, myScore, oppScore, pct, playing, toPlay, done, lock, st }.
export function matchupState(s, gameStates, playTotals = null) {
  const adj = adjustedMatchup(s, gameStates, playTotals);
  const mine = adj?.mine ?? null;
  const opp = adj?.opp ?? null;
  const live = adj ? adj.live : s.matchupActual ?? null;
  const myScore = live ? live.mine : mine?.pts ?? null;
  const oppScore = live ? live.opp : opp?.pts ?? null;
  const pct = s.isBye ? null : adj ? adj.winChance : s.winChance ?? null;
  const playing = (mine?.playing || 0) + (opp?.playing || 0);
  const toPlay = (mine?.yetToPlay || 0) + (opp?.yetToPlay || 0);
  const started = myScore > 0 || oppScore > 0 || playing > 0;
  const done = Boolean(mine && opp && started && playing === 0 && toPlay === 0);
  // YOU WIN / Out of reach only when the result is locked (lib/standing.js lockIn), never from the percentage alone.
  const lock = lockIn(mine, opp, myScore, oppScore);
  return { adj, mine, opp, live, myScore, oppScore, pct, playing, toPlay, done, lock, st: standing(pct, done, lock) };
}
