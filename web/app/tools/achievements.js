// Shared source of truth for the ten "achievement" flags a Weekly
// Projection Rankings row can carry (Established/Building confidence,
// On Fire, On Thin Ice, Risky Icarus, Steady Eddy, Buy Low, Sell High,
// Super Hero, Honorable, Con Artist) -- WeeklyDetailRow.js's expanded player banner renders
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

// "Honorable" / "Con Artist" -- two opposite xFP badges, both all-or-nothing over the last 3 logged games:
//   Honorable:  scored at-or-above xFP in ALL 3.
//   Con Artist: scored strictly below xFP in ALL 3.
// A mixed result earns neither. Missing xFP for any game the badge needs (~12% of games, see
// CLAUDE.md) voids that read entirely rather than judging off fewer data points. ("Con Artist" was "Rug Pull"
// until its icon got redrawn -- a small ornate carpet read as an
// envelope/dollar sign at badge size, so the badge itself was renamed
// to match the new comedy/tragedy-masks icon: putting on a good number,
// then not delivering it, twice running.)
const hasXfp = (g) => g.exp_points_ppr != null && g.fantasy_points_ppr != null;
export function xfpTrend2(games) {
  if (!games) return null;
  const last3 = games.slice(0, 3);
  if (last3.length < 3 || !last3.every(hasXfp)) return null;
  if (last3.every((g) => g.fantasy_points_ppr >= g.exp_points_ppr)) return "honorable";
  if (last3.every((g) => g.fantasy_points_ppr < g.exp_points_ppr)) return "conArtist";
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
// RE-DERIVED Oct 20 2026 after the weekly ceiling moved from a ~4-6% to a 10% exceed rate (CEIL_Q in projection_engine.R):
// every floor-to-ceiling range got ~4-5 points narrower, so the old cutoffs would have flagged 43% of eligible QBs as
// Steady Eddy and almost nobody as Risky Icarus. Same rule as before (10th / 90th percentile of the ratio over eligible
// rows, rounded to 0.05), fit on 2026 WEEK 7, the first week published with the new ceiling (19-41 players per position, a
// small sample -- re-derive as more weeks accumulate). Previous values, fit on week 4 under the old ceiling:
// QB 1.2 / 1.95, RB 1.3 / 2.55, WR 1.25 / 2.6, TE 1.6 / 2.9.
export const SPREAD_CUTOFFS = {
  QB: { locked: 0.95, volatile: 1.6 },
  RB: { locked: 1.05, volatile: 2.25 },
  WR: { locked: 1.15, volatile: 2.2 },
  TE: { locked: 1.25, volatile: 2.5 },
};
// Unknown position: roughly the pooled all-position p10 / p90.
const DEFAULT_SPREAD_CUTOFFS = { locked: 1.1, volatile: 2.2 };
export function spreadFlag(floor, ceiling, projection, position) {
  if (floor == null || ceiling == null || projection == null || projection < PROJECTION_FLOOR) return null;
  const ratio = (ceiling - floor) / Math.max(projection, 1);
  const cut = SPREAD_CUTOFFS[position] || DEFAULT_SPREAD_CUTOFFS;
  if (ratio >= cut.volatile) return "volatile";
  if (ratio <= cut.locked) return "locked";
  return null;
}

// "Buy Low" -- real workload that hasn't shown up on the scoreboard the
// last 2 games (and who has still scored at or above xFP in 2 of his last 3 -- see atOrAboveXfpTwoOfLast3). A genuinely different dimension from every badge above:
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
// Added Oct 2026 at the founder's direction: the usage + below-median reads alone let genuinely bad players
// in (heavy-ish usage, bad results, no sign the results were about to turn). So the player must also have
// scored at or above his xFP in at least 2 of his last 3 games -- his production has been keeping pace
// with the opportunity most of the time, and the below-median pair is the dip. A game with no xFP row
// (~12% of games) just doesn't count toward the 2, so it can't help a player qualify.
export function atOrAboveXfpTwoOfLast3(games) {
  if (!games || games.length < 3) return false;
  const hits = games.slice(0, 3).filter((g) => hasXfp(g) && g.fantasy_points_ppr >= g.exp_points_ppr).length;
  return hits >= 2;
}
export function buyLowFlag(woprPercentile, games) {
  if (woprPercentile == null || woprPercentile < USAGE_HIGH_PERCENTILE) return false;
  return underperformingMedianLast2(games) && atOrAboveXfpTwoOfLast3(games);
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

// "Super Hero" -- outright top scorer at their own position for a given
// (season, week), counted across every week player_game_log holds (both
// trailing seasons, not just the current one -- see page.js's
// fetchGameLogData). Repeatable by design: a player can win it many
// times, and the badge's own art (DragonBall.js: a ball with 1-7 stars) grows
// a star per top-3 finish. `tier` caps the ART at 7 even though `wins` can keep climbing past that -- the
// label text still states the real count (e.g. "9x Super Hero"), only
// the illustration stops getting busier past a 7-time winner.
export const HERO_MAX_TIER = 7;
// Elite Role / Elite Player: top 10 at his position in the opened-player panel's Role / Player group (row.groupRank, lib/statPanel.js) -- the ranking
// by average rank over the group's numbers, NOT the weekly projection ranking.
export const ELITE_RANK = 10;

// Ordered list of whichever of the flags apply to this row, as plain
// {key, variant, label, ...} metadata -- no JSX/icons here, since the
// two consumers render the same flag very differently (a full badge vs.
// a bare dot).
// getAchievements is pure in the row, and the same row objects are looked at by the badge filter, the table and the
// dots on every keystroke / click -- remember the answer per row object instead of recomputing hundreds of them.
const achievementCache = new WeakMap();
export function getAchievementsCached(row) {
  let v = achievementCache.get(row);
  if (!v) {
    v = getAchievements(row);
    achievementCache.set(row, v);
  }
  return v;
}

export function getAchievements(row) {
  // A player projected for zero points (listed OUT, or on a bye) keeps the badges that describe HIM -- Established / Building, On Fire / On Thin
  // Ice, Buy Low / Sell High, Honorable / Con Artist, Super Hero (all from his past games) -- but not the two that read THIS week: the range
  // (Steady Eddy / Risky Icarus, there is no projected range) and the matchup (Smash / Tough Spot, there is no game). Rows without a
  // `projection` (pages that don't carry one) are unaffected.
  const playing = !(row.projection != null && row.projection <= 0);
  const isEstablished = row.sample_confidence === "established";
  const isBuilding = row.sample_confidence === "building";
  const onFire = onFireFlag(row.recentGames);
  const onIce = onThinIceFlag(row.recentGames);
  const spread = playing ? spreadFlag(row.floor, row.ceiling, row.projection, row.position) : null;
  const xfpFlag = xfpTrend2(row.recentGames);
  const heroWins = Math.max(0, row.heroWins || 0);
  const buyLow = buyLowFlag(row.woprPercentile, row.recentGames);
  const sellHigh = sellHighFlag(row.woprPercentile, row.recentGames);
  // Matchup badge: just the ▲ / ▼ beside the opponent (lib/defenseLeans.js flagFor, attached as row.defLean by
  // Weekly Projection Rankings), shown as a badge too. Display only -- never a projection input. Rows without a
  // defLean (every page that doesn't load the leans, bye weeks, defenses with no strong trend) just don't get it.
  const matchup = playing ? row.defLean || null : null;
  const eliteRole = row.groupRank?.role?.rank <= ELITE_RANK;
  const elitePlayer = row.groupRank?.player?.rank <= ELITE_RANK;

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
    matchup && {
      key: "matchup",
      variant: matchup.call === "SMASH" ? "smash" : "tough",
      label: matchup.call === "SMASH" ? "Smash Spot" : "Tough Spot",
      text: matchup.text,
    },
    xfpFlag === "honorable" && { key: "honorable", variant: "honorable", label: "Honorable" },
    xfpFlag === "conArtist" && { key: "conArtist", variant: "menace", label: "Con Artist" },
    eliteRole && { key: "eliteRole", variant: "eliteRole", label: "Elite Role", rank: row.groupRank.role.rank },
    elitePlayer && { key: "elitePlayer", variant: "elitePlayer", label: "Elite Player", rank: row.groupRank.player.rank },
    // Always last: the ball badge closes the row.
    heroWins > 0 && {
      key: "hero",
      variant: "ball",
      label: `${heroWins}x Super Hero`,
      wins: heroWins,
      weeks: row.heroWinWeeks || [],
      tier: Math.min(heroWins, HERO_MAX_TIER),
    },
  ].filter(Boolean);
}
