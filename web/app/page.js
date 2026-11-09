import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import EventHorizon from "./EventHorizon";
import { SiteTicker } from "./SiteHeader";
import { loadYourWeek } from "./hub/YourWeek";
import { getDynastyRows } from "@/lib/dynastyData";
import { buildBoard, scoreRows } from "@/lib/dynastyBoard";
import { isLiveReferralCode } from "@/lib/referrals";
import { REF_COOKIE, FRIEND_DISCOUNT_PERCENT } from "@/lib/referralRules";
import { fetchGameStates, nextKickoff } from "@/lib/gameStatus";
import { expectedWins } from "@/lib/briefing";
import { formatWin } from "@/lib/standing";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/authUser";
import { createPublicClient } from "@/lib/supabase/public";

// The home page is the Event Horizon landing page (app/EventHorizon.js) for everyone (founder, Nov 9 2026). The design before
// it -- the orbit-chip hero, the hub, the rocket pricing and the members' week briefing -- is the git tag design-classic-2026-11-09.
// Always rendered per request (it reads the visitor's session); said out loud so `next build` never tries to prerender it.
export const dynamic = "force-dynamic";

// What the page reads that is the same for every visitor: this week's top five (the weekly section) and the
// three newest posts (the Tuesday letter). Cached 60s.
const getCachedHomeData = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const [{ data: posts }, { data: latest }] = await Promise.all([
      supabase.from("posts").select("id, title, url, published_at").order("published_at", { ascending: false }).limit(3),
      supabase.from("redraft_rankings").select("season, week").order("season", { ascending: false }).order("week", { ascending: false }).limit(1).maybeSingle(),
    ]);
    let weekly = [];
    if (latest) {
      const { data } = await supabase
        .from("redraft_rankings")
        .select("rank, player_name, position, team, opponent, projection, floor, ceiling")
        .eq("season", latest.season)
        .eq("week", latest.week)
        .order("rank", { ascending: true })
        .limit(12);
      weekly = (data || []).filter((x) => x.projection > 0 && x.floor != null && x.ceiling > x.projection).slice(0, 5).map((x) => ({ rank: x.rank, name: x.player_name, pos: x.position, team: x.team, opp: x.opponent, floor: x.floor, median: x.projection, ceiling: x.ceiling }));
    }
    return { posts: posts || [], weekly, week: latest?.week ?? null };
  },
  ["landing-page-data-v3"],
  { revalidate: 60 }
);

export default async function Home() {
  const supabase = await createClient();
  const [{ posts, weekly, week: weekNo }, user, states] = await Promise.all([
    getCachedHomeData(),
    getAuthUser(supabase),
    Promise.race([fetchGameStates().catch(() => null), new Promise((r) => setTimeout(() => r(null), 1500))]),
  ]);
  // A member with saved leagues: the hole shows their week (leagues, wins to expect) instead of the lookup box.
  const week = user ? await loadYourWeek(supabase, user).catch(() => null) : null;
  let member = null;
  if (week) {
    const { wins, of } = expectedWins(week.rows);
    const matchups = week.rows.filter((r) => !r.bye && r.p != null).slice(0, 6).map((r) => ({ id: r.id, name: r.name, p: r.p, say: `${r.label.toLowerCase()} · ${formatWin(r.p)}` }));
    // the matchups table shown inside the horizon (the classic page's "Your matchups"); plain values only, the client formats them
    const rows = week.rows.map((r) => ({ id: r.id, name: r.name, record: r.record, opponent: r.opponent, bye: r.bye, live: r.live, mine: r.mine, opp: r.opp, p: r.p, label: r.label, tone: r.tone }));
    member = { name: week.name, leagues: week.teams.length, wins, of, matchups, rows };
  }
  // Arrived through a friend's referral link (proxy.js remembers the code): say the discount is waiting.
  const refCode = (await cookies()).get(REF_COOKIE)?.value;
  const invited = !member && refCode ? await isLiveReferralCode(refCode) : false;

  // The Dynasty Draft Board's top six (the same default view the free board shows: Superflex, Contender) with the tier each sits in.
  const { rows: dRows } = getDynastyRows(false);
  const dList = scoreRows(dRows, "sf", "contender").slice(0, 30);
  const tiers = buildBoard(dList).tiers;
  const dynasty = dList.slice(0, 6).map((r, i) => ({ rank: i + 1, name: r.name, pos: r.pos, team: r.team, age: r.age, score: r.score, tier: tiers.findIndex((t) => i >= t.a && i <= t.b) + 1 }));

  return (
    <>
    <SiteTicker />
    <EventHorizon
      signedIn={Boolean(user)}
      member={member}
      invited={invited}
      discountPct={FRIEND_DISCOUNT_PERCENT}
      weekly={weekly}
      weekNo={weekNo}
      dynasty={dynasty}
      nextKickoff={nextKickoff(states)}
      posts={posts}
    />
    </>
  );
}
