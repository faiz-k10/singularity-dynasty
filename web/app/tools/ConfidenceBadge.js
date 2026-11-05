import { BADGE_ICONS, filledBadgeSvg } from "@/lib/badgeIcons";
// Confidence is a flag (gold = established, silver = building), from the shared badge set (lib/badgeIcons.js) so it is centred like every badge.
export function FlagIcon({ filled = false }) {
  return <span className="badge-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: filled ? filledBadgeSvg("confidence") : BADGE_ICONS.confidence }} />;
}

// Gold = established (full trust in the player's own history).
// Silver = building sample (under 20 career games, blended with a
// positional baseline). Maps directly to the model's `shrunk` flag.
export default function ConfidenceBadge({ confidence, filled = false }) {
  if (confidence !== "established" && confidence !== "building") return null;
  const isEstablished = confidence === "established";
  return (
    <span
      className={`confidence-badge ${isEstablished ? "gold" : "silver"}`}
    >
      <FlagIcon filled={filled} />
    </span>
  );
}
