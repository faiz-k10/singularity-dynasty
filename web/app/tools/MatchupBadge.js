// Small colored dot next to the Opponent code: red/yellow/green for
// tough/neutral/favorable this-week matchup. `mult` is the same
// opponent-strength multiplier baked into the row's projection (1.0 =
// neutral, capped to [0.80, 1.20]) -- see compute_matchup_multipliers()
// in projection_engine.R. Thresholds split that range into thirds.
export default function MatchupBadge({ mult }) {
  if (mult === null || mult === undefined) return null;
  const m = Number(mult);
  if (Number.isNaN(m)) return null;

  const pct = Math.round((m - 1) * 100);
  let cls, label;
  if (m >= 1.07) {
    cls = "good";
    label = `Favorable matchup — allows ${pct >= 0 ? "+" : ""}${pct}% vs. league average`;
  } else if (m <= 0.93) {
    cls = "bad";
    label = `Tough matchup — allows ${pct}% vs. league average`;
  } else {
    cls = "neutral";
    label = `Neutral matchup — allows ${pct >= 0 ? "+" : ""}${pct}% vs. league average`;
  }

  return <span className={`matchup-dot ${cls}`} title={label}></span>;
}
