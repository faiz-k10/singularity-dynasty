import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSleeperState } from "@/lib/sleeper";
import { evaluateHealth } from "@/lib/healthRules";

// Gathers what lib/healthRules.js judges: the NFL week (Sleeper), when the weekly rankings and season simulations were last
// published, how far the game log reaches, and errors in the last hour. Each read fails on its own (a missing value is
// judged as such). Server-only (service role).
export async function loadHealth() {
  const admin = createAdminClient();
  const latest = (table) =>
    admin.from(table).select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => data?.created_at || null, () => null);
  // Which weeks of this season have rows: one cheap count per week, up to the newest one (a gap is a week missing from the site).
  const weeksWithRows = async (table, newest) => {
    if (!newest) return null;
    const season = new Date().getFullYear();
    const counts = await Promise.all(
      Array.from({ length: newest }, (_, i) =>
        admin.from(table).select("week", { count: "exact", head: true }).eq("season", season).eq("week", i + 1).then(({ count, error }) => (error ? null : count), () => null)
      )
    );
    return counts.some((c) => c == null) ? null : counts.map((c, i) => (c > 0 ? i + 1 : null)).filter(Boolean);
  };
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const [nfl, rankingsPublishedAt, simsPublishedAt, gameLogWeek, errorsLastHour] = await Promise.all([
    fetchSleeperState().catch(() => ({})),
    latest("redraft_rankings"),
    latest("player_simulations"),
    admin
      .from("player_game_log")
      .select("week")
      .eq("season", new Date().getFullYear())
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => data?.week ?? null, () => null),
    admin
      .from("app_errors")
      .select("id", { count: "exact", head: true })
      .gte("created_at", hourAgo)
      .then(({ count, error }) => (error ? null : count ?? 0), () => null),
  ]);
  const simNewest = await admin.from("player_simulations").select("week").eq("season", new Date().getFullYear()).order("week", { ascending: false }).limit(1).maybeSingle().then(({ data }) => data?.week ?? null, () => null);
  const [simWeeks, gameLogWeeks] = await Promise.all([weeksWithRows("player_simulations", simNewest), weeksWithRows("player_game_log", gameLogWeek)]);
  return { nfl, rankingsPublishedAt, simsPublishedAt, gameLogWeek, errorsLastHour, simWeeks, gameLogWeeks, ...evaluateHealth({ now: Date.now(), nfl, rankingsPublishedAt, simsPublishedAt, gameLogWeek, errorsLastHour, simWeeks, gameLogWeeks }) };
}
