import PricingLadder from "./PricingLadder";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import SiteHeader from "./SiteHeader";
import LandingHub from "./hub/LandingHub";
import HorizonBand from "./hub/HorizonBand";
import YourWeek, { loadYourWeek } from "./hub/YourWeek";
import GravityMap from "./hub/GravityMap";
import { cookies } from "next/headers";
import { isLiveReferralCode } from "@/lib/referrals";
import { REF_COOKIE, FRIEND_DISCOUNT_PERCENT } from "@/lib/referralRules";
import EventHorizon from "./EventHorizon";
import { fetchGameStates, nextKickoff } from "@/lib/gameStatus";
import NewsletterForm from "./NewsletterForm";
import LeaguePrice from "./LeaguePrice";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/authUser";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";

// Always rendered per request (it already was: the header reads the visitor's session). Said out loud so
// `next build` never tries to prerender it -- without database settings (CI) the public data fetches
// would throw before the build noticed the page is dynamic.
export const dynamic = "force-dynamic";

function formatPostDate(iso) {
  return new Date(iso)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase();
}

// Founding-cohort scarcity for Singularity -- first 50 real subscribers
// only. Counted live off profiles.tier so this can never drift stale the
// way a hardcoded "50 remaining" would the moment anyone actually signs
// up; clamped at 0 rather than going negative once the cohort fills.
const SINGULARITY_FOUNDING_CAP = 50;

// Everything the landing page reads is the same for every visitor (public
// tables, plus one service-role count), so it is fetched once -- the three
// independent chains in parallel -- and cached for 60s. It used to run six
// queries back to back on every load, which was most of the page's ~2s wait.
const getCachedHomeData = unstable_cache(
  async () => {
    const supabase = createPublicClient();

    const redraftChain = async () => {
      const { data: latestWeek } = await supabase
        .from("redraft_rankings")
        .select("season, week")
        .order("season", { ascending: false })
        .order("week", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latestWeek) return { latestWeek: null, topRedraft: [] };
      const { data: top } = await supabase
        .from("redraft_rankings")
        .select("rank, player_name, position, projection, floor, ceiling")
        .eq("season", latestWeek.season)
        .eq("week", latestWeek.week)
        .order("rank", { ascending: true })
        .limit(3);
      return { latestWeek, topRedraft: top || [] };
    };

    const [{ data: posts }, { latestWeek, topRedraft }, { count: singularityCount }] = await Promise.all([
      supabase.from("posts").select("id, title, url, published_at").order("published_at", { ascending: false }).limit(3),
      redraftChain(),
      // profiles' RLS only lets a visitor read their OWN row (see
      // 0001_profiles.sql), so a real cross-user count needs the
      // service-role admin client -- otherwise every signed-out visitor's
      // count query would just return 0 and this would silently show a
      // static, wrong "50 remaining" forever regardless of real signups.
      createAdminClient().from("profiles").select("*", { count: "exact", head: true }).eq("tier", "singularity"),
    ]);
    return { posts: posts || [], latestWeek, topRedraft, singularityCount: singularityCount || 0 };
  },
  ["landing-page-data-v2"],
  { revalidate: 60 }
);

export default async function Home() {
  const { posts, latestWeek, topRedraft, singularityCount } = await getCachedHomeData();
  // Signed in with saved leagues: the hero becomes their week (app/hub/YourWeek.js). Signed in without: the hero box's last
  // button reads "Open my leagues" instead of "Save your leagues".
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  const yourWeek = user ? await loadYourWeek(supabase, user).catch(() => null) : null;
  // Arrived through a friend's referral link (proxy.js remembers the code): say the discount is waiting.
  const refCode = (await cookies()).get(REF_COOKIE)?.value;
  const invited = !yourWeek && refCode ? await isLiveReferralCode(refCode) : false;

  // Visitors (and members with no saved leagues) get the Event Horizon landing page (app/EventHorizon.js). Members with
  // leagues keep their week briefing on the classic page below until it is redesigned too.
  if (!yourWeek) {
    const top = topRedraft.find((r) => r.projection > 0 && r.floor != null && r.ceiling > r.projection);
    const states = await Promise.race([fetchGameStates().catch(() => null), new Promise((r) => setTimeout(() => r(null), 1500))]);
    return (
      <EventHorizon
        signedIn={Boolean(user)}
        invited={invited}
        discountPct={FRIEND_DISCOUNT_PERCENT}
        player={top && latestWeek ? { name: top.player_name, week: latestWeek.week, floor: top.floor, median: top.projection, ceiling: top.ceiling } : null}
        nextKickoff={nextKickoff(states)}
        posts={posts}
      />
    );
  }

  const singularityRemaining = Math.max(0, SINGULARITY_FOUNDING_CAP - singularityCount);

  return (
    <>
      <SiteHeader />

      <nav className="orbit-nav" id="orbitNav">
        <a
          href="#hero"
          className="orbit-dot active"
          aria-label="Signal section"
        ></a>
        <a
          href="#tools"
          className="orbit-dot"
          aria-label="Tools section"
        ></a>
        <a
          href="#pricing"
          className="orbit-dot"
          aria-label="Pricing section"
        ></a>
        <a
          href="#feed"
          className="orbit-dot"
          aria-label="Feed section"
        ></a>
      </nav>

      <div className="eh-meter" aria-hidden="true">
        <svg viewBox="0 0 52 52">
          <circle className="eh-track" cx="26" cy="26" r="22"></circle>
          <circle className="eh-fill" id="ehFill" cx="26" cy="26" r="22"></circle>
        </svg>
        <div className="eh-pct mono" id="ehPct">
          0%
        </div>
      </div>

      <header className="hero" id="hero">
        <div className="wrap" id="main-content">
          <YourWeek data={yourWeek} />
          <GravityMap rows={yourWeek.rows} now={yourWeek.now} />
        </div>
      </header>

      <HorizonBand />

      <main className="wrap">
        <LandingHub />

        <section id="tools">
          <div className="section-head reveal">
            <div className="sec-index" aria-hidden="true"><b>02</b><i></i><span className="mono">02 / 04</span></div>
          <div className="eyebrow blue">What&apos;s Inside</div>
            <h2>Six tools. One gravity well.</h2>
            <p>
              Built by a data analyst who got tired of rankings based on
              vibes. Every module runs on real weekly data — snap counts,
              target share, air yards, opportunity share — pulled from the
              same box-score and usage APIs used across the industry, then
              regressed against years of outcome data.
            </p>
          </div>

          <div className="orbital-selector reveal">

            <div className="orbital-hub">
              <div className="hub-panel active" data-panel="0">
                <span className="hub-tag">API LIVE · 10,000 RUNS</span>
                <h3>Player Season Simulations</h3>
                <Link href="/tools/player-simulations" className="hub-panel-link">
                  View Live Simulations →
                </Link>
                <p>
                  Full-season Monte Carlo simulations run 10,000 times per
                  player, mapping a full probability distribution of outcomes
                  instead of a single point estimate.
                </p>
                <div className="mock-panel" style={{ marginTop: "18px" }}>
                  <div className="mock-head">
                    <h4>Season Simulation — 10,000 Runs</h4>
                    <span className="mono">API LIVE</span>
                  </div>
                  <div className="chart-bars">
                    <div className="bar" style={{ height: "22%" }}></div>
                    <div className="bar" style={{ height: "41%" }}></div>
                    <div className="bar accent" style={{ height: "88%" }}></div>
                    <div className="bar accent" style={{ height: "76%" }}></div>
                    <div className="bar" style={{ height: "35%" }}></div>
                  </div>
                  <div className="chart-labels">
                    <span>4-6</span>
                    <span>7-9</span>
                    <span>10-12</span>
                    <span>13-15</span>
                    <span>16+</span>
                  </div>
                </div>
                <ul className="feature-list gold">
                  <li>10,000 simulated outcomes per player, every week</li>
                  <li>10th / 50th / 90th percentile floor, median, and ceiling</li>
                </ul>
              </div>

              <div className="hub-panel" data-panel="2">
                <span className="hub-tag">ROUND-BY-ROUND</span>
                <h3>Dynasty Draft Board</h3>
                <Link href="/tools/draft-board" className="hub-panel-link">
                  View Live Board →
                </Link>
                <p>
                  A full startup and rookie draft board, laid out round by
                  round, with correlated stacks auto-flagged via
                  roster-construction analysis.
                </p>
              </div>

              <div className="hub-panel" data-panel="3">
                <span className="hub-tag">MATCHUP-ADJUSTED</span>
                <h3>Weekly Projection Rankings</h3>
                <Link href="/tools/redraft-rankings" className="hub-panel-link">
                  View Live Rankings →
                </Link>
                <p>
                  Standard weekly projection rankings refreshed every week of
                  the season, adjusted for opponent-strength and matchup
                  efficiency data.
                </p>
                <div className="mock-panel" style={{ marginTop: "18px" }}>
                  <div className="mock-head">
                    <h4>Weekly Projection Rankings</h4>
                    <span className="mono">
                      {latestWeek ? `WEEK ${latestWeek.week}` : "LIVE"}
                    </span>
                  </div>
                  {topRedraft.map((row, i) => (
                    <div className="board-row" key={row.rank}>
                      <span className="board-rank">{row.rank}</span>
                      <span className="board-name">
                        {row.player_name} <span className="board-pos">{row.position}</span>
                      </span>
                      <span className={`board-tier ${i === 0 ? "tier-s" : "tier-a"}`}>
                        {Math.round(row.projection)}
                      </span>
                    </div>
                  ))}
                </div>
                <ul className="feature-list gold">
                  <li>Refreshed every week, not just at the start of the season</li>
                  <li>Adjusted for opponent-strength and matchup efficiency</li>
                </ul>
              </div>

              <div className="hub-panel" data-panel="5">
                <span className="hub-tag">PERCENTILE COMPS</span>
                <h3>WR/QB Prospect Rankings &amp; Comparisons</h3>
                <Link href="/tools/prospect-rankings" className="hub-panel-link">
                  View Live Board →
                </Link>
                <p>
                  Incoming rookie rankings for wide receivers and
                  quarterbacks, with side-by-side statistical comps against
                  past prospects using athletic and production percentiles.
                </p>
              </div>
            </div>

            <div className="orbital-arc">
              <div className="orbit-track"></div>
              <div className="orbital-nodes">
                <button
                  className="node active"
                  data-panel="0"
                  style={{ "--nx": "-477px", "--ny": "67px" }}
                >
                  <span className="node-label">Player Season Simulations</span>
                </button>
                <button
                  className="node"
                  data-panel="2"
                  style={{ "--nx": "-161px", "--ny": "7px" }}
                >
                  <span className="node-label">Dynasty Draft Board</span>
                </button>
                <button
                  className="node"
                  data-panel="3"
                  style={{ "--nx": "161px", "--ny": "7px" }}
                >
                  <span className="node-label">Weekly Projection Rankings</span>
                </button>
                <button
                  className="node"
                  data-panel="5"
                  style={{ "--nx": "477px", "--ny": "67px" }}
                >
                  <span className="node-label">Prospect Rankings</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing">
          <div className="section-head reveal">
            <div className="sec-index" aria-hidden="true"><b>03</b><i></i><span className="mono">03 / 04</span></div>
            <div className="eyebrow">Pricing</div>
            <h2>Every subscriber earns a title.</h2>
            <p>
              Start as a Stargazer, free. Ascend when you want the full
              gravitational pull of the data.
            </p>
          </div>

          <div className="toggle-row reveal">
            <span>Monthly</span>
            <button
              className="toggle on"
              id="billingToggle"
              aria-label="Toggle annual billing"
              aria-pressed="true"
            >
              <span className="knob"></span>
            </button>
            <span>Annual</span>
            <span className="save-tag">~20% Off</span>
          </div>

          <PricingLadder singularityRemaining={singularityRemaining} />

          <LeaguePrice />

          <div className="pricing-assurance reveal d2">
            <span className="mono">14-DAY REFUND · CANCEL ANYTIME</span>
            <p>
              Not seeing signal in your first two weeks? Full refund, no
              questions asked. Cancel from your account any time — no
              lock-in, no retention maze.
            </p>
          </div>
        </section>

        <section id="feed" className="feed-section">
          <div className="section-head reveal">
            <div className="sec-index" aria-hidden="true"><b>04</b><i></i><span className="mono">04 / 04</span></div>
            <div className="eyebrow blue">The Feed</div>
            <h2>Cutting-edge dynasty &amp; fantasy football, in your inbox.</h2>
            <p>
              Model notes, ranking shifts, and rookie-comp breakdowns —
              written for dynasty players who want an edge
              sharper than the mock consensus, delivered every Tuesday before
              waivers process.
            </p>
          </div>

          <div className="feed-grid">
            <NewsletterForm source="home" />

            <div className="feed-posts reveal d1">
              <div className="feed-posts-label mono">Recent Drops</div>
              {posts && posts.length > 0 ? (
                posts.map((post) => (
                  <a href={post.url} className="feed-post" key={post.id}>
                    <span className="feed-post-title">{post.title}</span>
                    <span className="feed-post-date mono">
                      {formatPostDate(post.published_at)}
                    </span>
                  </a>
                ))
              ) : (
                <p className="feed-post-empty">
                  First drop lands soon — subscribe to catch it.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>

    </>
  );
}
