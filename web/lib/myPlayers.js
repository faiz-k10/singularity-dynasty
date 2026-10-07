// "My players": the signed-in user's saved Sleeper rosters (saved_teams, see
// app/my-team) boiled down to a tiny lookup the two tool pages can use to mark and
// filter their own guys. Server side loads it; the pure helpers below also run in the browser.
//
// Shape (kept small -- it is serialized into the page):
//   { signedIn, teams: ["League A", ...], byName: { "josh allen": [[teamIndex, isStarter 0|1], ...] } }
import { normalizePlayerName } from "./portfolio.js";

// Same lookup from saved-team rows already in hand (the My Team page has them).
export function mineFromTeams(rows) {
  const teams = [];
  const byName = {};
  (rows || []).forEach((t, i) => {
    teams.push(t.league_name || t.team_name || `Team ${i + 1}`);
    for (const p of t.players || []) {
      if (!p?.name) continue;
      const key = normalizePlayerName(p.name);
      (byName[key] ||= []).push([i, p.isStarter ? 1 : 0]);
    }
  });
  return { signedIn: true, teams, byName };
}

export async function loadMyPlayers(supabase, user) {
  if (!user) return { signedIn: false, teams: [], byName: {} };
  const { data } = await supabase
    .from("saved_teams")
    .select("team_name, league_name, players")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  return mineFromTeams(data);
}

// Where a player sits on the user's teams: null when he is on none (of the chosen league),
// else { leagues: [{ label, starter }], starter } -- starter is true if he starts anywhere in it.
export function ownedFor(mine, name, league = "all") {
  const hits = mine?.byName?.[normalizePlayerName(name)];
  if (!hits) return null;
  const sel = league === "all" ? hits : hits.filter((h) => h[0] === Number(league));
  if (!sel.length) return null;
  return {
    leagues: sel.map(([i, s]) => ({ label: mine.teams[i], starter: !!s })),
    starter: sel.some((h) => h[1]),
  };
}

// How many distinct players the user has (in the chosen league, or all).
export function myPlayerCount(mine, league = "all") {
  if (!mine?.byName) return 0;
  let n = 0;
  for (const hits of Object.values(mine.byName)) {
    if (league === "all" || hits.some((h) => h[0] === Number(league))) n++;
  }
  return n;
}
