import SiteHeader from "../SiteHeader";
import { createClient } from "@/lib/supabase/server";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedTeams = [];
  if (user) {
    const { data } = await supabase
      .from("saved_teams")
      .select("id, league_name, team_name, players, platform_league_id, settings")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    savedTeams = data || [];
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

        <MyTeamClient isSignedIn={!!user} savedTeams={savedTeams} />
      </main>
    </div>
  );
}
