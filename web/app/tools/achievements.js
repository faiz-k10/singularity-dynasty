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
// relative to the PLAYER'S OWN projection (a coefficient-of-variation
// style ratio), not the pool's widest range. An earlier version compared
// against maxSpread (the same widest-range value the Curve panel uses),
// but that quietly rewarded near-irrelevant bench players with "Steady
// Eddy" -- a 0-to-3-point range is trivially "tight" next to a stud's
// 30-point range, even though projected for 1.5 points isn't what "safe,
// predictable floor" is supposed to mean. A live audit of one real week
// found 190 of 429 rows (44%) qualifying as "locked" under that math,
// almost entirely replacement-level bench -- the badge was firing
// constantly, just never on anyone worth seeing it on. Comparing against
// the player's own projection instead holds a top-of-the-board stud and
// a low-end flex to the same bar, and PROJECTION_FLOOR keeps waiver-wire
// chaff (near-zero floor AND ceiling, so a trivially "tight" ratio) out
// of contention for either badge. Thresholds were picked off that same
// audit to land each flag around the top ~10% of eligible players --
// rare enough to mean something, not so rare it never fires.
export const PROJECTION_FLOOR = 8;
export const LOCKED_RATIO = 1.2;
export const VOLATILE_RATIO = 2.2;
export function spreadFlag(floor, ceiling, projection) {
  if (floor == null || ceiling == null || projection == null || projection < PROJECTION_FLOOR) return null;
  const ratio = (ceiling - floor) / Math.max(projection, 1);
  if (ratio >= VOLATILE_RATIO) return "volatile";
  if (ratio <= LOCKED_RATIO) return "locked";
  return null;
}

// Ordered list of whichever of the six flags apply to this row, as
// plain {key, variant, label} metadata -- no JSX/icons here, since the
// two consumers render the same flag very differently (a full badge vs.
// a bare dot).
export function getAchievements(row) {
  const trend = TREND_COPY[row.trend];
  const isEstablished = row.sample_confidence === "established";
  const isBuilding = row.sample_confidence === "building";
  const hasBounceNote = typeof row.notes === "string" && row.notes.startsWith("BOUNCEBACK");
  const streak = xfpStreak(row.recentGames);
  const spread = spreadFlag(row.floor, row.ceiling, row.projection);

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
