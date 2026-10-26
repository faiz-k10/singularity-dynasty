// Confidence is a flag (gold = established, silver = building) -- changed from a star on request. A flat pole + waving
// field, drawn in currentColor like every other badge glyph. Nudged right and down so the shape's visual weight (the
// field sits high on the pole) lands at the centre of the badge circle, not just its bounding box.
export function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <g transform="translate(0.6,1.2)">
        <path d="M5 2.8a1 1 0 0 1 1 1v16.4a1 1 0 1 1-2 0V3.8a1 1 0 0 1 1-1z" />
        <path d="M6.6 4.4c2.2-1.25 4.45-1.25 6.65 0s4.45 1.25 6.65 0v8.6c-2.2 1.25-4.45 1.25-6.65 0s-4.45-1.25-6.65 0z" />
      </g>
    </svg>
  );
}

// Gold = established (full trust in the player's own history).
// Silver = building sample (under 20 career games, blended with a
// positional baseline). Maps directly to the model's `shrunk` flag.
export default function ConfidenceBadge({ confidence }) {
  if (confidence !== "established" && confidence !== "building") return null;
  const isEstablished = confidence === "established";
  return (
    <span
      className={`confidence-badge ${isEstablished ? "gold" : "silver"}`}
    >
      <FlagIcon />
    </span>
  );
}
