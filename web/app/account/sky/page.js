import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/authUser";
import { loadSky } from "@/lib/nightSkyStore";
import { complimentsFor } from "@/lib/skyCompliments";
import { getDynastyRows } from "@/lib/dynastyData";
import { scoreRows } from "@/lib/dynastyBoard";
import SiteHeader from "../../SiteHeader";
import SkyClient from "./SkyClient";

export const metadata = {
  title: "The Night Sky — Dynasty Singularity",
  robots: { index: false, follow: false },
};

const norm = (n) => String(n || "").toLowerCase().replace(/[^a-z]/g, "");

// The Night Sky (lib/nightSky.js for the rules, lib/nightSkyStore.js for the dice and storage). Stars are earned on the rest of the site; this
// page shows the sky, opens the telescope on finds made since the last visit, and holds the catalogue, sets, rewards and Beat the Model.
export default async function SkyPage() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/login?next=%2Faccount%2Fsky");

  const [sky, { data: teams }] = await Promise.all([
    loadSky(user.id),
    supabase.from("saved_teams").select("league_name, team_name, settings, players").eq("user_id", user.id),
  ]);
  const dynastyTop = new Set(scoreRows(getDynastyRows(true).rows, "sf", "contender").slice(0, 50).map((r) => norm(r.name)));
  const compliments = complimentsFor(teams || [], dynastyTop);

  return (
    <div className="tool-page">
      <SiteHeader />
      <main id="main-content" className="wrap tool-wrap sky-wrap">
        <div className="eyebrow">
          <Link href="/account">Account</Link> · The Night Sky
        </div>
        <h1>Your sky</h1>
        {sky.ready ? (
          <SkyClient initial={sky.state} weekKey={sky.weekKey} event={sky.ctx.event} compliments={compliments} now={sky.ctx.now} today={sky.ctx.day} />
        ) : (
          <p className="tool-sub">The Night Sky is being set up. Check back soon.</p>
        )}
      </main>
    </div>
  );
}
