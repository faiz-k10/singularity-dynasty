import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { indexLabGames } from "@/lib/labData";

// Every game this season and last for The Lab's season-so-far numbers and game-log chart (player_game_log, the same table Recent Games and
// the badges read; paged, since it passes 1000 rows). Kept as compact arrays per player (lib/labData.js indexLabGames) so the cache entry
// stays far under Next's 2MB limit. The table only changes when the weekly game data publishes, so 10 minutes is plenty.
export const getCachedLabGames = unstable_cache(
  async (season) => {
    const rows = await fetchAllRows(
      createPublicClient(),
      "player_game_log",
      "player_name, season, week, opponent, fantasy_points_ppr, exp_points_ppr",
      (q) => q.gte("season", season - 1).lte("season", season).order("season", { ascending: true }).order("week", { ascending: true }).order("player_name", { ascending: true })
    );
    return indexLabGames(rows, season);
  },
  ["lab-game-log-v1"],
  { revalidate: 600 }
);
