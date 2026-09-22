// Publisher for public.player_actual_production (migration 0021), derived
// directly from public.player_game_log instead of hand-entry.
//
// player_actual_production's own shape (season, week, player_name,
// position, actual_points -- one row per player per week ACTUALLY played,
// no zero row for a bye) is identical to player_game_log's own
// (season, week, player_name, position, fantasy_points_ppr), which is
// already refreshed weekly from real nflreadr box scores (see
// model/player_game_log.R + publish-player-game-log.mjs) as a normal part
// of the weekly publish cycle. Re-deriving this table from that one
// instead of separate hand entry means Player Season Simulations' vs Pace/
// Pace %ile columns (lib/regressionScore.js / lib/outcomePercentile.js)
// stay current automatically at the same point every other weekly number
// does, rather than silently going stale until someone remembers to type
// rows in by hand.
//
// Scoped to the CURRENT season only (the max season present in
// player_game_log) -- player_actual_production only ever powers a
// current-season regression score, same scoping page.js's own query
// already uses. Full refresh of that season's rows (delete + reinsert)
// rather than an upsert -- there's no unique constraint on
// (season, week, player_name) to conflict-target against (see the
// migration), and the row count here is small (one season, not two).
//
// Run: node --env-file=.env.local scripts/publish-actual-production.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAllPages(query) {
  let out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await query().range(from, from + 999);
    if (error) {
      console.error("Fetch failed:", error.message);
      process.exit(1);
    }
    out = out.concat(data);
    if (data.length < 1000) return out;
    from += 1000;
  }
}

const { data: latestRow, error: latestErr } = await supabase
  .from("player_game_log")
  .select("season")
  .order("season", { ascending: false })
  .limit(1)
  .maybeSingle();
if (latestErr || !latestRow) {
  console.error("Could not determine current season from player_game_log:", latestErr?.message);
  process.exit(1);
}
const season = latestRow.season;

const gameLogRows = await fetchAllPages(() =>
  supabase
    .from("player_game_log")
    .select("player_name, position, season, week, fantasy_points_ppr")
    .eq("season", season)
    .order("week", { ascending: true })
);

const payload = gameLogRows
  .filter((r) => r.fantasy_points_ppr != null)
  .map((r) => ({
    season: r.season,
    week: r.week,
    player_name: r.player_name,
    position: r.position,
    actual_points: r.fantasy_points_ppr,
  }));

console.log(`Rebuilding player_actual_production for season ${season} with ${payload.length} player-weeks...`);
const { error: delErr } = await supabase.from("player_actual_production").delete().eq("season", season);
if (delErr) {
  console.error("Delete failed:", delErr.message);
  process.exit(1);
}

const BATCH = 1000;
for (let i = 0; i < payload.length; i += BATCH) {
  const chunk = payload.slice(i, i + BATCH);
  const { error } = await supabase.from("player_actual_production").insert(chunk);
  if (error) {
    console.error(`Insert failed at row ${i}:`, error.message);
    process.exit(1);
  }
  console.log(`  inserted ${Math.min(i + BATCH, payload.length)} / ${payload.length}`);
}
console.log("Done.");
