// A real SVG star (Heroicons solid) instead of a plain "★" text glyph --
// a font character's own bounding box is at the mercy of whatever font
// actually renders it (varies by platform/fallback), and even a well-
// centered one still isn't a shape we control. This path is centered by
// construction the same way every other badge's hand-drawn icon is,
// which is what actually lets .confidence-badge/.weekly-glyph-badge's
// shared CSS keep it centered exactly, not approximately.
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.007z" />
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
      title={
        isEstablished
          ? "Established — full trust in this player's own game log"
          : "Building sample — under 20 career games, blended with a positional baseline"
      }
    >
      <StarIcon />
    </span>
  );
}
