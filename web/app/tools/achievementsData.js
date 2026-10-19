import { percentileRank } from "@/lib/statPercentiles";
import { fetchAllRows } from "@/lib/fetchAllRows";

// Server-side data plumbing for getAchievements() (achievements.js),
// shared by every tool page that wants to show the same badges Weekly
// Projection Rankings does. Ported out of redraft-rankings/page.js
// verbatim (see that file's own history for the original reasoning
// behind each piece) so Player Season Simulations/Prospect Rankings/
// Compare Players/My Team can reuse it instead of each re-deriving On
// Fire/On Thin Ice's per-game floor-ceiling join or the weekly
// positional-winner count themselves. Nothing here is retuned from the
// original Weekly Projection Rankings version -- same thresholds, same
// season-spanning recentGames, same all-or-nothing xFP rules.

// Historical Floor/Ceiling/Median per (player, season, week) --
// redraft_rankings accumulates one row per player per PUBLISHED week
// rather than overwriting the previous week's rows, so past weeks'
// projections are still sitting in the table and can be matched up
// against player_game_log's real result for that same week. That's what
// lets On Fire ("beat that week's own ceiling"/"beat that week's own
// median") and On Thin Ice ("missed that week's own floor"/"missed that
// week's own median") judge a past game against the numbers that were
// actually projected for it. `projection` is that week's median (see
// CLAUDE.md -- it stays in the DB as the internal sort basis even though
// it's not its own visible column anymore), renamed to `median` here to
// avoid confusion with a ROW's own current-week projection field
// elsewhere in this file. Rows published before migration 0029 predate
// floor/ceiling entirely and read null; median (`projection`) has always
// existed.
export async function fetchHistoricalFloorCeiling(supabase) {
  // EVERY published week (a response is capped at 1000 rows, and this table is ~480 rows a week, so a plain select returned an
  // arbitrary 1000 of them and the per-game floor / ceiling join behind On Fire / On Thin Ice came back empty for the rest).
  const data = await fetchAllRows(supabase, "redraft_rankings", "player_name, season, week, floor, ceiling, projection", (q) =>
    q.order("season", { ascending: true }).order("week", { ascending: true }).order("player_name", { ascending: true })
  );
  const map = {};
  for (const r of data || []) {
    map[`${r.player_name}|${r.season}|${r.week}`] = { floor: r.floor, ceiling: r.ceiling, median: r.projection };
  }
  return map;
}

// recentGames (last 5 logged games, most-recent-first, each carrying its
// own week's floor/ceiling) and heroWins (top-3-at-position finishes
// THIS season, with the actual weeks they happened) per player, pulled
// from the full player_game_log. `season` scopes Super Hero only --
// recentGames itself still spans the season boundary same as every page
// that already uses it.
// Reading every game is real work (the whole game log plus every published week), and My Team's refresh runs it on every
// page view, so one answer is kept per server instance for 5 minutes (and concurrent callers share one in-flight read).
const INPUT_TTL_MS = 5 * 60 * 1000;
const inputsMemo = new Map(); // season -> { at, promise }
export function fetchAchievementInputs(supabase, season) {
  const hit = inputsMemo.get(season);
  if (hit && Date.now() - hit.at < INPUT_TTL_MS) return hit.promise;
  const promise = loadAchievementInputs(supabase, season);
  inputsMemo.set(season, { at: Date.now(), promise });
  promise.catch(() => inputsMemo.delete(season)); // never remember a failure
  return promise;
}

async function loadAchievementInputs(supabase, season) {
  const floorCeilingByGame = await fetchHistoricalFloorCeiling(supabase);
  // EVERY game in the log, newest first. A plain select stopped at the newest 1000 rows (about four weeks of games), so Super
  // Hero wins (top-3 finishes at a position each week) silently missed the earlier weeks of the season.
  const data = await fetchAllRows(supabase, "player_game_log", "player_name, position, season, week, fantasy_points_ppr, exp_points_ppr", (q) =>
    q.order("season", { ascending: false }).order("week", { ascending: false }).order("player_name", { ascending: true }).order("team", { ascending: true })
  );

  const byPlayer = {};
  for (const r of data || []) {
    const fc = floorCeilingByGame[`${r.player_name}|${r.season}|${r.week}`] || {};
    (byPlayer[r.player_name] ??= []).push({
      ...r,
      floor: fc.floor ?? null,
      ceiling: fc.ceiling ?? null,
      median: fc.median ?? null,
    });
  }
  const recentGamesByName = {};
  for (const [name, games] of Object.entries(byPlayer)) {
    recentGamesByName[name] = games.slice(0, 5);
  }

  // The newest published rankings week is the one being played right now (a Thursday game is already in the log), so
  // only weeks before it can hand out Super Hero wins -- a top-3 among the few who've played isn't a real finish.
  const { data: cur } = await supabase
    .from("redraft_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  const done = (r) => !cur || r.season < cur.season || r.week < cur.week;
  const HERO_WIN_SLOTS = 3;
  const heroWinsByName = {};
  const byWeekPos = {};
  for (const r of data || []) {
    if (r.fantasy_points_ppr == null || r.season !== season || !done(r)) continue;
    (byWeekPos[`${r.season}|${r.week}|${r.position}`] ??= []).push(r);
  }
  for (const rows of Object.values(byWeekPos)) {
    const winners = rows.sort((a, b) => b.fantasy_points_ppr - a.fantasy_points_ppr).slice(0, HERO_WIN_SLOTS);
    for (const r of winners) {
      const entry = (heroWinsByName[r.player_name] ??= { count: 0, weeks: [] });
      entry.count += 1;
      entry.weeks.push({ season: r.season, week: r.week });
    }
  }
  for (const entry of Object.values(heroWinsByName)) {
    entry.weeks.sort((a, b) => b.season - a.season || b.week - a.week);
  }

  return { recentGamesByName, heroWinsByName };
}

// sample_confidence/notes/floor/ceiling/projection per player, from the
// LATEST published redraft_rankings week -- the only source for these
// (Established/Building, Risky Icarus, Steady Eddy all key off them).
// Deliberately kept separate from any OTHER floor/ceiling a page already
// has for that player (e.g. Player Season Simulations' own season-total
// floor/median/ceiling) -- Risky Icarus/Steady Eddy's thresholds are
// calibrated for WEEKLY numbers, so buildAchievementRow below always
// sources floor/ceiling/projection from here, never from the page's own
// row, to avoid silently re-tuning the badge against a different scale.
// Null/undefined for anyone not in that week's publish (a rookie
// prospect never ranked, a deep-roster save) -- those three flags just
// don't fire for them, same as any other missing-data case
// getAchievements() already handles.
export async function fetchLatestRedraftFieldsByName(supabase) {
  const { data: latest } = await supabase
    .from("redraft_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return {};
  const { data } = await supabase
    .from("redraft_rankings")
    .select("player_name, sample_confidence, notes, floor, ceiling, projection")
    .eq("season", latest.season)
    .eq("week", latest.week);
  const byName = {};
  for (const r of data || []) byName[r.player_name] = r;
  return byName;
}

// WOPR (weighted opportunity rating -- receiving usage) ranked WITHIN
// POSITION, from Player Season Simulations' own latest published batch --
// a separate table/pipeline from redraft_rankings, joined by player_name
// only (no week alignment assumed; player_simulations republishes on its
// own weekly cadence, same season). Powers Buy Low/Sell High below --
// real workload that hasn't (or, for Sell High, results that HAVE
// without) shown up on the scoreboard yet.
//
// Ranked by position, not a flat cross-position cutoff on the raw
// number -- WOPR only counts receiving usage (targets + air yards), so
// RBs cluster far lower than WRs even as genuine workhorses on the
// ground. A real-world check found a 0.154 raw WOPR reading as "low
// usage" against a flat threshold when it was actually ~82nd percentile
// among RBs specifically. Reuses the exact percentileRank() math Player
// Season Simulations/redraft-rankings already use for their own stat
// percentile panels, always against the FULL position pool (every
// player in this week's Player Sims publish, not whichever subset the
// calling page happens to be displaying), same reasoning as
// buildStatPoolByPos's own comment on why a teaser-truncated pool would
// be wrong. Null for anyone not yet in that table, or without a
// pool-mate at their position to rank against.
export async function fetchWoprPercentileByName(supabase) {
  const { data: latest } = await supabase
    .from("player_simulations")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return {};
  const { data } = await supabase
    .from("player_simulations")
    .select("player_name, position, wopr")
    .eq("season", latest.season)
    .eq("week", latest.week);

  const poolByPosition = {};
  for (const r of data || []) {
    if (r.wopr == null) continue;
    (poolByPosition[r.position] ??= []).push(r.wopr);
  }
  const byName = {};
  for (const r of data || []) {
    if (r.wopr == null) continue;
    byName[r.player_name] = percentileRank(r.wopr, poolByPosition[r.position]);
  }
  return byName;
}

// Builds the exact row shape getAchievements() expects for one player,
// from the four input maps above -- entirely independent of whatever
// fields the calling page's own row already has (a Player Sims row's
// own season floor/median/ceiling, a My Team roster slot, ...), so
// wiring this into a new page can never collide with or overwrite that
// page's existing display data.
export function buildAchievementRow(playerName, position, inputs) {
  const hero = inputs.heroWinsByName[playerName];
  const rf = inputs.redraftFieldsByName[playerName] || {};
  return {
    player_name: playerName,
    position,
    recentGames: inputs.recentGamesByName[playerName] || [],
    heroWins: hero?.count || 0,
    heroWinWeeks: hero?.weeks || [],
    sample_confidence: rf.sample_confidence ?? null,
    notes: rf.notes ?? null,
    floor: rf.floor ?? null,
    ceiling: rf.ceiling ?? null,
    projection: rf.projection ?? null,
    woprPercentile: inputs.woprPercentileByName?.[playerName] ?? null,
  };
}
