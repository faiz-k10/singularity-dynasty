// Shared source of truth for the eight "achievement" flags a Weekly
// Projection Rankings row can carry (Established/Building confidence,
// On Fire, On Thin Ice, Risky Icarus, Steady Eddy, Weekly Hero, Honorable,
// Con Artist) -- WeeklyDetailRow.js's expanded player banner renders
// these as full click-to-expand badges, and RankingsTable.js's collapsed
// row renders the same list as a tiny dot preview. Both read off this
// one function so the two views can't quietly drift out of sync with
// each other. Two flags used to live here too, both removed by request:
// RISING/FALLING/STEADY trend (the trend arrow already has its own place,
// TrendTag/the name-hover popover -- repeating it as a medallion was one
// badge too many) and Bounce-back (redraft_rankings.notes' "BOUNCEBACK"
// flag, dropped for having no real predictive grounding -- see
// BounceBadge.js's own git history if it needs to come back; the model
// may still publish that notes prefix, it just renders as plain text
// now instead of being intercepted into its own badge).

// "On Fire" -- scored at or above THAT WEEK'S OWN projected ceiling in
// the most recent logged game. `games` is page.js's recentGames, most-
// recent-first, with `floor`/`ceiling` already joined in per-game from
// that same week's redraft_rankings publish (fetchHistoricalFloorCeiling)
// -- not this week's unrelated projection. Null/missing ceiling for that
// game (a game logged before migration 0029, or a week that was never
// published) just means no flag, not a false positive.
export function ceilingHit(games) {
  if (!games || games.length === 0) return false;
  const g = games[0];
  if (g.fantasy_points_ppr == null || g.ceiling == null) return false;
  return g.fantasy_points_ppr >= g.ceiling;
}

// "On Thin Ice" -- missed THAT WEEK'S OWN projected floor in at least 2 of
// the last 3 logged games. Deliberately a count, not an all-3 requirement
// like the old xFP-streak version this replaced: floor/ceiling coverage
// depends on how far back redraft_rankings' own publish history reaches,
// so requiring all 3 to have data would make this almost never fire this
// early in the feature's life. A game missing floor or its own actual
// score simply doesn't count as a hit either way, rather than voiding
// the other two.
export function floorHitStreak(games) {
  if (!games || games.length < 3) return false;
  const last3 = games.slice(0, 3);
  const hits = last3.filter(
    (g) => g.fantasy_points_ppr != null && g.floor != null && g.fantasy_points_ppr <= g.floor
  ).length;
  return hits >= 2;
}

// "Honorable" / "Con Artist" -- scored at-or-above, or strictly below,
// xFP in BOTH of the last 2 logged games. Same all-or-nothing shape as
// the old 3-game xFP streak, just over 2 games and split into two
// opposite badges instead of one heat/cold pair -- a mixed result (beat
// it once, missed it once) earns neither. Missing xFP for either of the
// 2 games (~12% of games, see CLAUDE.md) voids the read entirely rather
// than judging off just one data point. ("Con Artist" was "Rug Pull"
// until its icon got redrawn -- a small ornate carpet read as an
// envelope/dollar sign at badge size, so the badge itself was renamed
// to match the new comedy/tragedy-masks icon: putting on a good number,
// then not delivering it, twice running.)
export function xfpTrend2(games) {
  if (!games || games.length < 2) return null;
  const last2 = games.slice(0, 2);
  if (last2.some((g) => g.exp_points_ppr == null || g.fantasy_points_ppr == null)) return null;
  if (last2.every((g) => g.fantasy_points_ppr >= g.exp_points_ppr)) return "honorable";
  if (last2.every((g) => g.fantasy_points_ppr < g.exp_points_ppr)) return "conArtist";
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

// "Weekly Hero" -- outright top scorer at their own position for a given
// (season, week), counted across every week player_game_log holds (both
// trailing seasons, not just the current one -- see page.js's
// fetchGameLogData). Repeatable by design: a player can win it many
// times, and the badge's own art (HeroIcon in WeeklyDetailRow.js) scales
// up through 5 "wearing a cape" tiers as the count climbs. `tier` caps
// the ART at 5 even though `wins` can keep climbing past that -- the
// label text still states the real count (e.g. "7x Weekly Hero"), only
// the illustration stops getting busier past a 5-time winner.
export const HERO_MAX_TIER = 5;

// Ordered list of whichever of the flags apply to this row, as plain
// {key, variant, label, ...} metadata -- no JSX/icons here, since the
// two consumers render the same flag very differently (a full badge vs.
// a bare dot).
export function getAchievements(row) {
  const isEstablished = row.sample_confidence === "established";
  const isBuilding = row.sample_confidence === "building";
  const onFire = ceilingHit(row.recentGames);
  const onIce = floorHitStreak(row.recentGames);
  const spread = spreadFlag(row.floor, row.ceiling, row.projection);
  const xfpFlag = xfpTrend2(row.recentGames);
  const heroWins = Math.max(0, row.heroWins || 0);

  return [
    (isEstablished || isBuilding) && {
      key: "confidence",
      variant: isEstablished ? "gold" : "silver",
      label: isEstablished ? "Established" : "Building",
    },
    onFire && { key: "onFire", variant: "heat", label: "On Fire" },
    onIce && { key: "onIce", variant: "ice", label: "On Thin Ice" },
    spread === "volatile" && { key: "volatile", variant: "icarus", label: "Risky Icarus" },
    spread === "locked" && { key: "locked", variant: "eddy", label: "Steady Eddy" },
    heroWins > 0 && {
      key: "hero",
      variant: "cape",
      label: `${heroWins}x Weekly Hero`,
      wins: heroWins,
      weeks: row.heroWinWeeks || [],
      tier: Math.min(heroWins, HERO_MAX_TIER),
    },
    xfpFlag === "honorable" && { key: "honorable", variant: "honorable", label: "Honorable" },
    xfpFlag === "conArtist" && { key: "conArtist", variant: "menace", label: "Con Artist" },
  ].filter(Boolean);
}
