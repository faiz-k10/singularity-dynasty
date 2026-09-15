// Shared source of truth for the six "achievement" flags a Weekly
// Projection Rankings row can carry (Established/Building confidence,
// Bounce-back, Rising/Falling/Steady trend, Heating Up/On Ice, Risky
// Icarus/Steady Eddy) -- WeeklyDetailRow.js's expanded player banner
// renders these as full click-to-expand badges, and RankingsTable.js's
// collapsed row renders the same list as a tiny dot preview. Both read
// off this one function so the two views can't quietly drift out of
// sync with each other.

export const TREND_COPY = {
  RISING: { cls: "up", arrow: "▲", label: "Rising" },
  FALLING: { cls: "down", arrow: "▼", label: "Falling" },
  STEADY: { cls: "steady", arrow: "—", label: "Steady" },
};

// "Heating Up" / "On Ice" -- the last 3 logged games (recentGames is
// already ordered most-recent-first by page.js's fetchGameLogData) all
// beating, or all missing, their own game's xFP. Same beat/below
// comparison Recent Games' own dot already makes per game, just
// requiring all 3 to agree before calling it a real streak rather than
// reading one good or bad week as a trend. Any of the 3 missing an xFP
// row (~12% of games, see CLAUDE.md) voids the streak rather than
// skipping past it -- a 2-game streak isn't the 3-game one this badge
// promises.
export function xfpStreak(games) {
  if (!games || games.length < 3) return null;
  const last3 = games.slice(0, 3);
  if (last3.some((g) => g.exp_points_ppr == null || g.fantasy_points_ppr == null)) return null;
  if (last3.every((g) => g.fantasy_points_ppr > g.exp_points_ppr)) return "heating";
  if (last3.every((g) => g.fantasy_points_ppr < g.exp_points_ppr)) return "cold";
  return null;
}

// "Risky Icarus" / "Steady Eddy" -- this week's own floor-ceiling spread
// relative to maxSpread, the same widest-range-in-the-pool value the
// Curve cell/panel is already drawn against, so "wide"/"tight" means
// relative to this week's real pool rather than an arbitrary point
// count. Thresholds are round numbers, not fit to any backtest -- there
// was no existing "volatile" label anywhere in the model to match.
export const VOLATILE_SPREAD_RATIO = 0.75;
export const LOCKED_SPREAD_RATIO = 0.35;
export function spreadFlag(floor, ceiling, maxSpread) {
  if (floor == null || ceiling == null || !maxSpread) return null;
  const ratio = (ceiling - floor) / maxSpread;
  if (ratio >= VOLATILE_SPREAD_RATIO) return "volatile";
  if (ratio <= LOCKED_SPREAD_RATIO) return "locked";
  return null;
}

// Ordered list of whichever of the six flags apply to this row, as
// plain {key, variant, label} metadata -- no JSX/icons here, since the
// two consumers render the same flag very differently (a full badge vs.
// a bare dot).
export function getAchievements(row, maxSpread) {
  const trend = TREND_COPY[row.trend];
  const isEstablished = row.sample_confidence === "established";
  const isBuilding = row.sample_confidence === "building";
  const hasBounceNote = typeof row.notes === "string" && row.notes.startsWith("BOUNCEBACK");
  const streak = xfpStreak(row.recentGames);
  const spread = spreadFlag(row.floor, row.ceiling, maxSpread);

  return [
    (isEstablished || isBuilding) && {
      key: "confidence",
      variant: isEstablished ? "gold" : "silver",
      label: isEstablished ? "Established" : "Building",
    },
    hasBounceNote && { key: "bounce", variant: "blue", label: "Bounce-back" },
    trend && { key: "trend", variant: trend.cls, label: trend.label },
    streak === "heating" && { key: "heating", variant: "heat", label: "Heating Up" },
    streak === "cold" && { key: "cold", variant: "ice", label: "On Ice" },
    spread === "volatile" && { key: "volatile", variant: "icarus", label: "Risky Icarus" },
    spread === "locked" && { key: "locked", variant: "eddy", label: "Steady Eddy" },
  ].filter(Boolean);
}
