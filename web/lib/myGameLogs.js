// The per-player-week game log (trailing two seasons) behind My Team's Analytics tab, for just the players on a user's saved
// teams. Public read (player_game_log is readable by everyone). It used to load on EVERY My Team page view and ride in the
// page's HTML (~215KB for 6 leagues) although only the Analytics tab uses it; it is now fetched on demand when that tab opens
// (server action getMyGameLogs in app/my-team/actions.js). PostgREST caps a response at 1000 rows, so it pages -- three
// pages at a time in parallel.
import { createPublicClient } from "./supabase/public";
import { normalizePlayerName } from "./portfolio";

const PAGE = 1000;
const COLUMNS = "normalized_name, season, week, is_home, won, fantasy_points_ppr, exp_points_ppr";

export function namesOnTeams(savedTeams) {
  const names = new Set();
  for (const t of savedTeams || []) for (const p of t.players || []) if (p.name) names.add(normalizePlayerName(p.name));
  return [...names];
}

export async function loadGameLogsFor(names) {
  const out = {};
  if (!names?.length) return out;
  const pub = createPublicClient();
  const page = (from) =>
    pub
      .from("player_game_log")
      .select(COLUMNS)
      .in("normalized_name", names)
      .order("normalized_name", { ascending: true })
      .order("season", { ascending: true })
      .order("week", { ascending: true })
      .range(from, from + PAGE - 1);
  for (let from = 0; ; from += PAGE * 3) {
    const chunks = await Promise.all([0, 1, 2].map((i) => page(from + i * PAGE)));
    let last = false;
    for (const { data } of chunks) {
      for (const g of data || []) (out[g.normalized_name] ??= []).push(g);
      if (!data || data.length < PAGE) last = true;
    }
    if (last) break;
  }
  return out;
}
