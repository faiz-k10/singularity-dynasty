import SiteHeader from "../SiteHeader";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { resolveTier, savedTeamLimit } from "@/lib/tier";
import { normalizePlayerName } from "@/lib/portfolio";
import MyTeamClient from "./MyTeamClient";

export const metadata = {
  title: "My Team — Singularity Dynasty",
  description:
    "Import your team from Sleeper, save it, and get ready for personalized roster analysis.",
};

// Step one of the team & profile builder (see CLAUDE.md's roadmap):
// import a real roster from Sleeper (Yahoo/ESPN later), save it, and this
// becomes the data Team Analysis reads from once that's built. Sleeper's
// API is public/unauthenticated, so the lookup itself works signed out --
// only saving a team needs an account (lib/sleeper.js + actions.js).
export default async function MyTeamPage() {
  const supabase = await createClient();
  const { user, tier } = await resolveTier(supabase);

  let savedTeams = [];
  if (user) {
    // select("*") rather than an explicit column list so the page keeps
    // working if a column-adding migration (e.g. 0025 buy_in) hasn't been
    // applied yet -- rows are RLS-scoped to this user regardless.
    const { data } = await supabase
      .from("saved_teams")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    savedTeams = data || [];
  }

  // Season sim numbers for the My Guys > My Analysis scatter -- public
  // read, no tier gate on these columns (same as the tool pages). Keyed
  // by normalized name so the client can join Sleeper roster players to
  // it. Only fetched when there's actually a portfolio to plot.
  let playerSims = {};
  if (savedTeams.length >= 2) {
    const pub = createPublicClient();
    const { data: latest } = await pub
      .from("player_simulations")
      .select("season, week")
      .order("season", { ascending: false })
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      const { data: sims } = await pub
        .from("player_simulations")
        .select("player_name, floor, median, ceiling, wopr, epa")
        .eq("season", latest.season)
        .eq("week", latest.week);
      for (const s of sims || []) {
        if (s.player_name) playerSims[normalizePlayerName(s.player_name)] = s;
      }
    }
  }

  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap">
        <div className="eyebrow">My Team</div>
        <h1>My Team</h1>
        <p className="tool-sub">
          Import your team from Sleeper to save it here. Yahoo and ESPN
          import are coming later, and this is the data that will power
          personalized Team Analysis.
        </p>

        <MyTeamClient
          isSignedIn={!!user}
          tier={tier}
          savedTeamLimit={savedTeamLimit(tier)}
          savedTeams={savedTeams}
          playerSims={playerSims}
        />
      </main>
    </div>
  );
}
