// Shared source of truth for the ten "achievement" flags a Weekly
// Projection Rankings row can carry (Established/Building confidence,
// On Fire, On Thin Ice, Risky Icarus, Steady Eddy, Buy Low, Sell High,
// Weekly Hero, Honorable, Con Artist) -- WeeklyDetailRow.js's expanded player banner renders
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

// "On Fire" -- true if EITHER: (A) hit or beat THAT WEEK'S OWN projected
// ceiling in the single MOST RECENT logged game, OR (B) matched/beat xFP
// AND beat THAT WEEK'S OWN median in ALL of the last 3 logged games.
// `games` is page.js's recentGames, most-recent-first, with
// `floor`/`ceiling`/`median` already joined in per-game from that same
// week's redraft_rankings publish (fetchHistoricalFloorCeiling) -- not
// this week's unrelated projection. Deliberately spans the season
// boundary same as recentGames itself (early in a season, "last game(s)"
// naturally tails into last season) -- confirmed with the user this is
// fine, not just tolerated. The two conditions are independent: (A)
// only needs the most recent game to have ceiling data to possibly fire
// (no published ceiling that game just means (A) can't fire, doesn't
// block (B)); (B) needs all 3 games to have xFP AND median data or it
// can't fire at all, same all-or-nothing rule Honorable/Con Artist
// already use below -- but (A) can still fire on its own even when (B)
// can't be evaluated.
export function ceilingHitMostRecent(games) {
  if (!games || games.length === 0) return false;
  const g = games[0];
  return g.fantasy_points_ppr != null && g.ceiling != null && g.fantasy_points_ppr >= g.ceiling;
}
export function beatXfpAndMedianAllLast3(games) {
  if (!games || games.length < 3) return false;
  const last3 = games.slice(0, 3);
  if (last3.some((g) => g.exp_points_ppr == null || g.fantasy_points_ppr == null || g.median == null)) return false;
  return (
    last3.every((g) => g.fantasy_points_ppr >= g.exp_points_ppr) &&
    last3.every((g) => g.fantasy_points_ppr > g.median)
  );
}
export function onFireFlag(games) {
  return ceilingHitMostRecent(games) || beatXfpAndMedianAllLast3(games);
}

// "On Thin Ice" -- the converse of On Fire: true if EITHER: (A) at or
// below THAT WEEK'S OWN projected floor in the single MOST RECENT logged
// game, OR (B) came in under xFP AND under THAT WEEK'S OWN median in ALL
// of the last 3 logged games. Same independence/null-handling rules as
// On Fire above, mirrored.
export function floorHitMostRecent(games) {
  if (!games || games.length === 0) return false;
  const g = games[0];
  return g.fantasy_points_ppr != null && g.floor != null && g.fantasy_points_ppr <= g.floor;
}
export function missedXfpAndMedianAllLast3(games) {
  if (!games || games.length < 3) return false;
  const last3 = games.slice(0, 3);
  if (last3.some((g) => g.exp_points_ppr == null || g.fantasy_points_ppr == null || g.median == null)) return false;
  return (
    last3.every((g) => g.fantasy_points_ppr < g.exp_points_ppr) &&
    last3.every((g) => g.fantasy_points_ppr < g.median)
  );
}
export function onThinIceFlag(games) {
  return floorHitMostRecent(games) || missedXfpAndMedianAllLast3(games);
}

// "Honorable" / "Con Artist" -- two opposite xFP badges, both all-or-nothing:
//   Honorable:  scored at-or-above xFP in BOTH of the last 2 logged games.
//   Con Artist: scored strictly below xFP in ALL of the last 3 logged games
//               (a longer run than Honorable on purpose -- it takes three straight misses).
// A mixed result earns neither. Missing xFP for any game the badge needs (~12% of games, see
// CLAUDE.md) voids that read entirely rather than judging off fewer data points. ("Con Artist" was "Rug Pull"
// until its icon got redrawn -- a small ornate carpet read as an
// envelope/dollar sign at badge size, so the badge itself was renamed
// to match the new comedy/tragedy-masks icon: putting on a good number,
// then not delivering it, twice running.)
const hasXfp = (g) => g.exp_points_ppr != null && g.fantasy_points_ppr != null;
export function xfpTrend2(games) {
  if (!games) return null;
  const last2 = games.slice(0, 2);
  if (last2.length === 2 && last2.every(hasXfp) && last2.every((g) => g.fantasy_points_ppr >= g.exp_points_ppr)) {
    return "honorable";
  }
  const last3 = games.slice(0, 3);
  if (last3.length === 3 && last3.every(hasXfp) && last3.every((g) => g.fantasy_points_ppr < g.exp_points_ppr)) {
    return "conArtist";
  }
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
// rare enough to mean something, not so rare it never fires. (Cutoffs are
// now per-position -- see SPREAD_CUTOFFS below.)
export const PROJECTION_FLOOR = 8;
// RECALIBRATED (Oct 2026): the ratio, the PROJECTION_FLOOR eligibility cut
// and the "top ~10% of eligible players" target are all unchanged. What
// changed is that the cutoffs are now PER POSITION. The single global pair
// (locked <= 1.2, volatile >= 2.2) was fit before the weekly/season ceiling
// recalibration (CEIL_Q) widened every floor-to-ceiling range, and after it
// 27% of eligible players read as Risky Icarus and only 5% as Steady Eddy
// (TEs: 58% Icarus). Position matters because ranges differ structurally --
// a QB's spread is narrow next to a TE's -- so one bar can't give each badge
// ~10% at every position. Cutoffs are the 10th (locked) / 90th (volatile)
// percentile of the ratio over eligible rows, rounded so they don't chase
// noise. Fit on 2026 WEEK 4 ONLY: it is the first week published with the
// final ceiling calibration (weeks 1-3 predate it and have narrower ranges),
// so it is a small sample (19-53 players per position; realized rates land
// between ~5% and ~11% per badge per position). Re-derive from
// redraft_rankings as more post-recalibration weeks accumulate.
export const SPREAD_CUTOFFS = {
  QB: { locked: 1.2, volatile: 1.95 },
  RB: { locked: 1.3, volatile: 2.55 },
  WR: { locked: 1.25, volatile: 2.6 },
  TE: { locked: 1.6, volatile: 2.9 },
};
// Unknown position: roughly the pooled all-position p10 / p90.
const DEFAULT_SPREAD_CUTOFFS = { locked: 1.3, volatile: 2.5 };
export function spreadFlag(floor, ceiling, projection, position) {
  if (floor == null || ceiling == null || projection == null || projection < PROJECTION_FLOOR) return null;
  const ratio = (ceiling - floor) / Math.max(projection, 1);
  const cut = SPREAD_CUTOFFS[position] || DEFAULT_SPREAD_CUTOFFS;
  if (ratio >= cut.volatile) return "volatile";
  if (ratio <= cut.locked) return "locked";
  return null;
}

// "Buy Low" -- real workload that hasn't shown up on the scoreboard the
// last 2 games. A genuinely different dimension from every badge above:
// those all key off floor/ceiling/median/xFP (a projection vs. an
// outcome); this keys off WOPR (weighted opportunity rating -- target
// share + air yards share, from Player Season Simulations' own latest
// publish), a measure of how much the OFFENSE is feeding a player,
// independent of whether it's scored yet. High usage without results is
// the classic buy-low signal -- volume tends to win out over a longer
// sample than 2 games.
//
// `woprPercentile` is WOPR ranked WITHIN POSITION (0-100, see
// redraft-rankings/page.js's attachStatPercentiles / achievementsData.js's
// fetchWoprPercentileByName), NOT the raw WOPR number. A flat raw-WOPR
// cutoff shared across positions was the first version of this badge and
// it was wrong: WOPR only counts receiving usage (targets + air yards),
// so RBs cluster far lower than WRs even as genuine workhorses on the
// ground -- a real-world check found a 0.154 WOPR reading as "low usage"
// by a cross-position cutoff when it was actually ~82nd percentile among
// RBs specifically. Ranking within position first fixes that.
export const USAGE_HIGH_PERCENTILE = 80; // top ~20% within the player's own position
export function underperformingMedianLast2(games) {
  if (!games || games.length < 2) return false;
  const last2 = games.slice(0, 2);
  if (last2.some((g) => g.fantasy_points_ppr == null || g.median == null)) return false;
  return last2.every((g) => g.fantasy_points_ppr < g.median);
}
export function buyLowFlag(woprPercentile, games) {
  if (woprPercentile == null || woprPercentile < USAGE_HIGH_PERCENTILE) return false;
  return underperformingMedianLast2(games);
}

// "Sell High" -- the literal inverse of Buy Low: LOW usage (within
// position, same woprPercentile basis) that's still somehow scoring
// above its own median 2 games running. If the workload isn't really
// there, the recent results are more likely luck (TD variance, garbage
// time, a soft matchup) than a repeatable level -- exactly the opposite
// argument Buy Low makes for volume winning out.
export const USAGE_LOW_PERCENTILE = 20; // bottom ~20% within the player's own position
export function overperformingMedianLast2(games) {
  if (!games || games.length < 2) return false;
  const last2 = games.slice(0, 2);
  if (last2.some((g) => g.fantasy_points_ppr == null || g.median == null)) return false;
  return last2.every((g) => g.fantasy_points_ppr > g.median);
}
export function sellHighFlag(woprPercentile, games) {
  if (woprPercentile == null || woprPercentile > USAGE_LOW_PERCENTILE) return false;
  return overperformingMedianLast2(games);
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
  const onFire = onFireFlag(row.recentGames);
  const onIce = onThinIceFlag(row.recentGames);
  const spread = spreadFlag(row.floor, row.ceiling, row.projection, row.position);
  const xfpFlag = xfpTrend2(row.recentGames);
  const heroWins = Math.max(0, row.heroWins || 0);
  const buyLow = buyLowFlag(row.woprPercentile, row.recentGames);
  const sellHigh = sellHighFlag(row.woprPercentile, row.recentGames);

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
    buyLow && { key: "buyLow", variant: "sprout", label: "Buy Low" },
    sellHigh && { key: "sellHigh", variant: "peak", label: "Sell High" },
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
