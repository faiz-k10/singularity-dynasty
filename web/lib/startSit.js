// Start / sit between two players: his weekly median plus the full points effect of a Smash / Tough Spot -- the only inputs that held up in the
// start / sit backtest (see the header of lib/lineupOptimizer.js for the numbers; the floor and ceiling picked WORSE than the median alone).
// Used by My Team's lineup advice and the start / sit share card. Pure; tested in test/startSit.test.mjs.

export const startValue = (median, effect) => (typeof median === "number" && Number.isFinite(median) ? median + (Number(effect) || 0) : null);

// a, b: { projection, effect } (effect = the Smash / Tough Spot points, 0 / null when unflagged). Returns { pick: "a" | "b" | null, gain }:
// null when it is closer than 0.1 points (a coin flip, said as such) or a value is missing.
export function pickStart(a, b) {
  const va = startValue(a?.projection, a?.effect);
  const vb = startValue(b?.projection, b?.effect);
  if (va == null || vb == null) return { pick: null, gain: 0 };
  const gain = Math.round(Math.abs(va - vb) * 10) / 10;
  if (gain < 0.1) return { pick: null, gain: 0 };
  return { pick: va > vb ? "a" : "b", gain };
}
