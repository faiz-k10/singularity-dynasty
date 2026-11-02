import TEAM_COLORS from "./teamColors";

// Our team codes (nflverse's, plus Sleeper's LAR) -> the logo file name in /public/team-logos. Every logo is hosted on
// our own site (96px PNGs, a light-theme and a dark-theme version each), never loaded from another site's servers.
// The model and Sleeper disagree on the Rams ("LA" / "LAR") and Washington ("WAS"); ESPN's file names are the base.
const LOGO = { LA: "lar", LAR: "lar", WAS: "wsh", WSH: "wsh", JAC: "jax" };
const LOGO_CODES = new Set(Object.keys(TEAM_COLORS).map((t) => (LOGO[t] || t).toLowerCase()));

// Relative luminance (WCAG formula) to pick readable text color against an
// arbitrary team color -- some brand colors (e.g. Steelers gold) are too
// light for white text, most are too dark for black text.
function textColorFor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5 ? "#0A0A0F" : "#E6F4F1";
}

// The team's logo (Oct 2026, founder's call -- the earlier version was a colored code pill because the marks are the
// NFL's trademarks; whether a paid product may show them is still a question for the lawyer review in CLAUDE.md).
// Two images, one per theme, swapped in CSS (.team-logo-light / .team-logo-dark) so there is no flash and it works in
// server components. A code we have no logo for falls back to the old colored pill.
// The logo's file name in /public/team-logos for a team code, or null when we have none (also used by the share-card images, lib/cardArt.js).
export function logoFile(team) {
  if (!team) return null;
  const file = (LOGO[team] || team).toLowerCase();
  return LOGO_CODES.has(file) ? file : null;
}

export default function TeamBadge({ team }) {
  if (!team) return <span className="mono">—</span>;
  const file = logoFile(team);
  if (file) {
    return (
      <span className="team-badge team-logo" role="img" aria-label={team}>
        <img className="team-logo-light" src={`/team-logos/${file}.png`} alt="" width="22" height="22" loading="lazy" decoding="async" />
        <img className="team-logo-dark" src={`/team-logos/${file}-dark.png`} alt="" width="22" height="22" loading="lazy" decoding="async" />
      </span>
    );
  }
  const bg = TEAM_COLORS[team] || "var(--line)";
  return (
    <span className="team-badge" style={{ background: bg, color: textColorFor(bg) }}>
      {team}
    </span>
  );
}
