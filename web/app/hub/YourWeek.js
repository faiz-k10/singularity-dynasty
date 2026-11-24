import { weekRows, displayName } from "@/lib/briefing";

// A signed-in member's saved leagues for the landing page (app/page.js turns them into the matchups inside the horizon and the
// planets). Reads the member's own rows through their session (RLS). Only what the page shows: it used to also build the "since
// last week" feed (two more table reads on every visit) for a briefing panel that is no longer drawn (Nov 23 2026).
export async function loadYourWeek(supabase, user) {
  const { data: teams } = await supabase
    .from("saved_teams")
    .select("id, league_name, team_name, settings, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (!teams?.length) return null;
  return { teams, rows: weekRows(teams), name: displayName(teams) };
}
