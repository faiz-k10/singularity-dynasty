// This week's published redraft_rankings projection + weekly floor / ceiling for every player, keyed by normalized
// name (Sleeper names have no suffixes, ours do -- see normalizePlayerName). Used by My Team's lookup and by the 30s
// live poll's win chance, so it's cached in module memory for 5 minutes: the poll then costs no database query.
// The table is public read, so sharing one copy across visitors is fine.
import { normalizePlayerName } from "./portfolio";

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
  const { data: rows, error } = await supabase
    .from("redraft_rankings")
    .select("player_name, projection, floor, ceiling")
    .eq("season", season)
    .eq("week", week);
  const byName = {};
  for (const r of rows || []) {
    if (!r.player_name || typeof r.projection !== "number") continue;
    byName[normalizePlayerName(r.player_name)] = {
      proj: r.projection,
      floor: r.floor == null ? null : Number(r.floor),
      ceiling: r.ceiling == null ? null : Number(r.ceiling),
    };
  }
  const value = { week, byName };
  if (!error) cache.set(season, { at: Date.now(), value });
  return value;
}
