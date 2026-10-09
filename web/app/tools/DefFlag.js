// The small ▲ / ▼ beside an opponent: that defense has one of the strongest trends against this player's
// position (lib/defenseLeans.js). Display only. The explanation is the hover tip (title).
export default function DefFlag({ lean }) {
  if (!lean) return null;
  const smash = lean.call === "SMASH";
  return (
    <span
      className={`def-flag ${smash ? "def-flag-smash" : "def-flag-avoid"}`}
      title={lean.text}
      role="img"
      aria-label={smash ? "Smash matchup" : "Tough matchup"}
    >
      {smash ? "\u25B2" : "\u25BC"}
    </span>
  );
}
