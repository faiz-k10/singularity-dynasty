// The model flags a player whose most recent real game landed at or
// below their own published floor (FLOOR_Q, the same calibrated quantile
// that produces the Floor column) -- redraft_rankings.notes comes
// through as "BOUNCEBACK (informational only)". It does NOT move the
// projection (backtest_bounceback_validation.R walk-forward killed the
// point adjustment -- the pattern is real but acting on it lost
// accuracy), so it renders like TrendTag: a small glyph with a tooltip,
// sitting next to the player name, not a number in the table. Trampoline
// = due for a bounce.
export default function BounceBadge({ note }) {
  if (typeof note !== "string" || !note.startsWith("BOUNCEBACK")) return null;
  return (
    <span
      className="bounce-badge"
      title="Bounce-back watch — last real game was at or below this player's own floor. Informational only; the projection is not adjusted for it."
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="4" r="2" fill="currentColor" stroke="none" />
        <path d="M6 9.5Q12 2.5 18 9.5" />
        <ellipse cx="12" cy="13.5" rx="8" ry="2.3" />
        <path d="M6 15 4 20" />
        <path d="M18 15 20 20" />
      </svg>
    </span>
  );
}
