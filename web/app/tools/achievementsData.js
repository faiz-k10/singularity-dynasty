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

// Historical Floor/Ceiling per (player, season, week) -- redraft_rankings
// accumulates one row per player per PUBLISHED week rather than
// overwriting the previous week's rows, so past weeks' projections are
// still sitting in the table and can be matched up against
// player_game_log's real result for that same week. That's what lets On
// Fire ("beat that week's own ceiling") and On Thin Ice ("missed that
// week's own floor") judge a past game against the number that was
// actually projected for it. Rows published before migration 0029
// predate floor/ceiling entirely and read null.
export async function fetchHistoricalFloorCeiling(supabase) {
  const { data } = await supabase
    .from("redraft_rankings")
    .select("player_name, season, week, floor, ceiling");
  const map = {};
  for (const r of data || []) {
    map[`${r.player_name}|${r.season}|${r.week}`] = { floor: r.floor, ceiling: r.ceiling };
  }
  return map;
}

// recentGames (last 5 logged games, most-recent-first, each carrying its
// own week's floor/ceiling) and heroWins (top-3-at-position finishes
// THIS season, with the actual weeks they happened) per player, pulled
// from the full player_game_log. `season` scopes Weekly Hero only --
// recentGames itself still spans the season boundary same as every page
// that already uses it.
export async function fetchAchievementInputs(supabase, season) {
  const floorCeilingByGame = await fetchHistoricalFloorCeiling(supabase);
  const { data } = await supabase
    .from("player_game_log")
    .select("player_name, position, season, week, fantasy_points_ppr, exp_points_ppr")
    .order("season", { ascending: false })
    .order("week", { ascending: false });

  const byPlayer = {};
  for (const r of data || []) {
    const fc = floorCeilingByGame[`${r.player_name}|${r.season}|${r.week}`] || {};
    (byPlayer[r.player_name] ??= []).push({ ...r, floor: fc.floor ?? null, ceiling: fc.ceiling ?? null });
  }
  const recentGamesByName = {};
  for (const [name, games] of Object.entries(byPlayer)) {
    recentGamesByName[name] = games.slice(0, 5);
  }

  const HERO_WIN_SLOTS = 3;
  const heroWinsByName = {};
  const byWeekPos = {};
  for (const r of data || []) {
    if (r.fantasy_points_ppr == null || r.season !== season) continue;
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

// Builds the exact row shape getAchievements() expects for one player,
// from the three input maps above -- entirely independent of whatever
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
  };
}
