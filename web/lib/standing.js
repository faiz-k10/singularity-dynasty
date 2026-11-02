// One word for where a matchup stands, shared by the Sunday board cards and the matchup panel so the colour and the headline mean
// the same thing everywhere (gold = going your way, blue = not, plain = too close).
//
// "YOU WIN" and "Out of reach" are CERTAINTIES, not predictions (founder's rule, Oct 19 2026: once YOU WIN is up there must be no
// chance, under any circumstances, that the matchup is decided the other way). So they never come from the win-chance
// percentage -- not even from 99.9% -- only from `lockIn`, which asks whether the trailing side could catch up even if every
// player it has left scored far more than anyone realistically can while the leader's own players still playing lost points.
// Anything short of that is a word with its percentage, however extreme: Favored 60%+, Toss-up 40% up to 60%, Underdog 15% up to 40%,
// Long shot below 15% (founder, Oct 26 2026: "Underdog implies a real chance"). Never "Out of reach" from the percentage: that would
// claim a certainty the math doesn't have (a live tight end could in theory still score 60).

// The most one player can still add in a game, whatever the league's scoring (all-time single-game outliers with room to spare;
// 6-point passing touchdowns and bonuses included). Scaled by the share of the game left, but never below a quarter of it:
// scoring is lumpy, and a quarter is longer than any realistic burst.
const GAIN_CAP = { QB: 90, RB: 75, WR: 75, TE: 60, K: 40, DEF: 50 };
const OTHER_GAIN_CAP = 75;
// The most a player who hasn't finished can still LOSE (turnovers, lost yards), and the cushion for the stat corrections Sleeper
// applies after a game (a lead has to clear it too).
const LOSS_CAP = 12;
const CORRECTION_BUFFER = 3;
const MIN_FRACTION = 0.25;
// Below this chance the word is "Long shot" (Underdog is 15% up to 40%).
const LONG_SHOT = 0.15;

// What one lineup could still gain / lose. `side` = lib/winChance.js summarizeSide() (players with their outlook).
function exposure(side) {
  let gain = 0;
  let loss = 0;
  for (const p of side?.players || []) {
    const o = p.outlook;
    if (!o || o.state === "empty" || o.state === "post" || o.state === "bye") continue; // finished, or never playing
    if (p.out) continue; // inactive / IR: not playing
    const f = o.frac == null ? 1 : Math.max(o.frac, MIN_FRACTION); // unknown scoreboard: assume the whole game is left
    gain += (GAIN_CAP[p.pos] ?? OTHER_GAIN_CAP) * f;
    loss += LOSS_CAP * f;
  }
  return { gain, loss };
}

// "win" | "loss" | null. Locked only when the lead survives the worst case on both sides plus the correction cushion.
export function lockIn(mine, opp, myScore, oppScore) {
  if (!mine || !opp || typeof myScore !== "number" || typeof oppScore !== "number") return null;
  const m = exposure(mine);
  const o = exposure(opp);
  if (myScore - m.loss - CORRECTION_BUFFER > oppScore + o.gain) return "win";
  if (oppScore - o.loss - CORRECTION_BUFFER > myScore + m.gain) return "loss";
  return null;
}

// Each word carries its colour (founder's table, Oct 26 2026): mint = Won, You win, Favored; red = Lost, Out of reach, Long shot;
// grey (steel) = Toss-up, Underdog. The cards, the matchup scoreboard and the header sentence all read `tone` from here.
// pct: win chance (0-1) or null; done: every game over; lock: lockIn()'s answer.
export function standing(pct, done, lock = null) {
  if (pct == null) return { key: "none", label: null, tone: null };
  if (done) return pct >= 0.5 ? { key: "won", label: "Won", tone: "mint" } : { key: "lost", label: "Lost", tone: "red" };
  if (lock === "win") return { key: "ahead", label: "You win", tone: "mint" };
  if (lock === "loss") return { key: "behind", label: "Out of reach", tone: "red" };
  if (pct >= 0.6) return { key: "ahead", label: "Favored", tone: "mint" };
  if (pct < LONG_SHOT) return { key: "behind", label: "Long shot", tone: "red" };
  if (pct < 0.4) return { key: "behind", label: "Underdog", tone: "grey" };
  return { key: "close", label: "Toss-up", tone: "grey" };
}

// A win chance as text. Near-certain is still not certain: only a locked result says YOU WIN, so the extremes read ">99%" /
// "<1%", never "100%" / "0%". Used by the Game Board, the dashboard and the signed-in home page.
export function formatWin(p) {
  return p == null ? "—" : p >= 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`;
}
