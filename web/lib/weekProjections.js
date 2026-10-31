// This week's published redraft_rankings projection + weekly floor / ceiling for every player, keyed by normalized
// name (Sleeper names have no suffixes, ours do -- see normalizePlayerName). Used by My Team's lookup and by the 30s
// live poll's win chance, so it's cached in module memory for 5 minutes: the poll then costs no database query.
// The table is public read, so sharing one copy across visitors is fine.
import { normalizePlayerName } from "./portfolio";
import { indexLeans, flagFor } from "./defenseLeans";
import { getCachedLeans } from "../app/tools/redraft-rankings/data";

const TTL_MS = 5 * 60 * 1000;

const cache = new Map(); // season -> { at, value }

export async function getWeekProjections(supabase, season) {
  const hit = cache.get(season);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  // Latest week our model has published for this season (it publishes the upcoming week).
  const { data: latest } = await supabase
    .from("redraft_rankings")
    .select("week")
    .eq("season", season)
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  const week = latest?.week ?? 1;
  // The same Smash / Tough Spot leans the Weekly Projection Rankings page flags (one cached read, shared), kept per player as the call + its points effect.
  const [leanRows, { data: rows, error }] = await Promise.all([
    getCachedLeans(),
    supabase.from("redraft_rankings").select("player_name, position, opponent, projection, floor, ceiling").eq("season", season).eq("week", week),
  ]);
  const leans = indexLeans(leanRows);
  const byName = {};
  for (const r of rows || []) {
    if (!r.player_name || typeof r.projection !== "number") continue;
    const lean = flagFor(leans, r.opponent, r.position) ? leans.get(`${r.opponent}|${r.position}`) : null;
    byName[normalizePlayerName(r.player_name)] = {
      proj: r.projection,
      floor: r.floor == null ? null : Number(r.floor),
      ceiling: r.ceiling == null ? null : Number(r.ceiling),
      lean: lean ? { call: lean.call, effect: Number(lean.effect) } : null,
    };
  }
  const value = { week, byName };
  if (!error) cache.set(season, { at: Date.now(), value });
  return value;
}

// This week's full ranking rows (who, where, against whom, projection + range) for My Team's "Best available" panel
// (lib/waivers.js). Same week rule and 5-minute module cache as above.
const rowsCache = new Map(); // season -> { at, value }
export async function getWeekRankRows(supabase, season) {
  const hit = rowsCache.get(season);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const { week } = await getWeekProjections(supabase, season);
  const { data: rows, error } = await supabase
    .from("redraft_rankings")
    .select("rank, player_name, position, team, opponent, is_home, projection, floor, ceiling")
    .eq("season", season)
    .eq("week", week)
    .order("rank", { ascending: true })
    .limit(2000);
  const value = { week, rows: rows || [] };
  if (!error) rowsCache.set(season, { at: Date.now(), value });
  return value;
}
