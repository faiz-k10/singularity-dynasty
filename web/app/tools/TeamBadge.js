import TEAM_COLORS from "./teamColors";

// Relative luminance (WCAG formula) to pick readable text color against an
// arbitrary team color -- some brand colors (e.g. Steelers gold) are too
// light for white text, most are too dark for black text.
function textColorFor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5 ? "#0A0A0F" : "#F5F3EE";
}

// Stylized team-color badge showing the team code -- deliberately NOT the
// real NFL team logo artwork (trademarked marks this product isn't
// licensed to reproduce), just a colored pill that reads as team identity
// at a glance.
export default function TeamBadge({ team }) {
  if (!team) return <span className="mono">—</span>;
  const bg = TEAM_COLORS[team] || "var(--line)";
  return (
    <span className="team-badge" style={{ background: bg, color: textColorFor(bg) }}>
      {team}
    </span>
  );
}
