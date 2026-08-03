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
      ★
    </span>
  );
}
