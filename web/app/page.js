import Link from "next/link";
import { unstable_cache } from "next/cache";
import SiteHeader from "./SiteHeader";
import LandingHub from "./hub/LandingHub";
import HeroLookup from "./HeroLookup";
import LeaguePrice from "./LeaguePrice";
import { createClient } from "@/lib/supabase/server";
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

// Fisher-Yates -- safe to do server-side here since Home() is a Server
// Component (no client hydration re-run to mismatch against), unlike
// NavStars.js's constellation pick which has to happen in a client
// useEffect for that exact reason.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CHIP_SLOTS = [
  { ang: "-90deg", r: "150px" },
  { ang: "-18deg", r: "150px" },
  { ang: "54deg", r: "150px" },
  { ang: "126deg", r: "150px" },
  { ang: "198deg", r: "150px" },
];

// Founding-cohort scarcity for Singularity -- first 50 real subscribers
// only. Counted live off profiles.tier so this can never drift stale the
// way a hardcoded "50 remaining" would the moment anyone actually signs
// up; clamped at 0 rather than going negative once the cohort fills.
const SINGULARITY_FOUNDING_CAP = 50;

// Everything the landing page reads is the same for every visitor (public
// tables, plus one service-role count), so it is fetched once -- the three
// independent chains in parallel -- and cached for 60s. It used to run six
// queries back to back on every load, which was most of the page's ~2s wait.
// The per-visitor shuffle of the hero chips stays in Home(), after the cache.
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
      if (!latestWeek) return { latestWeek: null, topRedraft: [], trendRows: [] };
      const [{ data: top }, { data: trend }] = await Promise.all([
        supabase
          .from("redraft_rankings")
          .select("rank, player_name, position, projection")
          .eq("season", latestWeek.season)
          .eq("week", latestWeek.week)
          .order("rank", { ascending: true })
          .limit(3),
        // Same RISING/FALLING trend field the ticker uses (SiteHeader.js) --
        // real week-over-week movement, not a fabricated stat.
        supabase
          .from("redraft_rankings")
          .select("player_name, trend, projection")
          .eq("season", latestWeek.season)
          .eq("week", latestWeek.week)
          .in("trend", ["RISING", "FALLING"])
          .limit(30),
      ]);
      return { latestWeek, topRedraft: top || [], trendRows: trend || [] };
    };

    const simsChain = async () => {
      const { data: simSeasonRow } = await supabase
        .from("player_simulations")
        .select("season")
        .order("season", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!simSeasonRow) return [];
      const { data } = await supabase
        .from("player_simulations")
        .select("player_name, floor, median, ceiling")
        .eq("season", simSeasonRow.season)
        .limit(30);
      return data || [];
    };

    const [{ data: posts }, { latestWeek, topRedraft, trendRows }, simRows, { count: singularityCount }] = await Promise.all([
      supabase.from("posts").select("id, title, url, published_at").order("published_at", { ascending: false }).limit(3),
      redraftChain(),
      simsChain(),
      // profiles' RLS only lets a visitor read their OWN row (see
      // 0001_profiles.sql), so a real cross-user count needs the
      // service-role admin client -- otherwise every signed-out visitor's
      // count query would just return 0 and this would silently show a
      // static, wrong "50 remaining" forever regardless of real signups.
      createAdminClient().from("profiles").select("*", { count: "exact", head: true }).eq("tier", "singularity"),
    ]);
    return { posts: posts || [], latestWeek, topRedraft, trendRows, simRows, singularityCount: singularityCount || 0 };
  },
  ["landing-page-data"],
  { revalidate: 60 }
);

export default async function Home() {
  const { posts, latestWeek, topRedraft, trendRows, simRows, singularityCount } = await getCachedHomeData();
  // Signed in? Only changes the hero box's last button ("Open my leagues" vs "Save your leagues").
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const heroCandidates = [];

  for (const r of trendRows) {
    heroCandidates.push({
      name: r.player_name,
      value: `${r.projection.toFixed(1)} PROJ ${r.trend === "RISING" ? "▲" : "▼"}`,
      dir: r.trend === "RISING" ? "up" : "down",
    });
  }

  // Boom/bust lean from the simulation's own shape -- more ceiling
  // upside than floor downside reads "up", the reverse reads "down".
  // Real derived signal, not an invented number.
  for (const r of simRows) {
    const upside = r.ceiling - r.median;
    const downside = r.median - r.floor;
    const isUp = upside >= downside;
    heroCandidates.push({
      name: r.player_name,
      value: `${Math.round(isUp ? r.ceiling : r.floor)} ${isUp ? "CEIL ▲" : "FLOOR ▼"}`,
      dir: isUp ? "up" : "down",
    });
  }

  // heroCandidates is built from two independent queries above (trend
  // rows + sim rows) -- the same player can easily land in both (e.g. a
  // RISING trend row AND a player_simulations row), and without deduping
  // first, shuffle+slice could pick that player twice into the same
  // panel: a visible duplicate name in the chips, and two React children
  // sharing key={chip.name} ("Encountered two children with the same
  // key"). Keeping just the first candidate per name (order is still
  // pre-shuffle at this point, so "first" isn't favoring either query)
  // fixes both.
  const seenNames = new Set();
  const uniqueCandidates = heroCandidates.filter((c) => {
    if (seenNames.has(c.name)) return false;
    seenNames.add(c.name);
    return true;
  });
  const heroChips = shuffle(uniqueCandidates).slice(0, CHIP_SLOTS.length);

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

      <div className="eh-meter">
        <svg viewBox="0 0 52 52">
          <circle className="eh-track" cx="26" cy="26" r="22"></circle>
          <circle className="eh-fill" id="ehFill" cx="26" cy="26" r="22"></circle>
        </svg>
        <div className="eh-pct mono" id="ehPct">
          0%
        </div>
      </div>

      <header className="hero" id="hero">
        <div className="wrap">
          <div>
            <div className="eyebrow">Dynasty · Best Ball · Data Gravity</div>
            <h1>
              Know the range
              <br />
              on every player,
              <br />
              in every <span>league</span>.
            </h1>
            <p className="lede">
              Enter your Sleeper username. We pull every league you play in and show you the floor, median and ceiling on your
              roster &mdash; and the players you&apos;re most exposed to.
            </p>
            <HeroLookup signedIn={Boolean(user)} />
          </div>

          <div className="orbit-signal" aria-hidden="true">
            <div className="os-ring r1"></div>
            <div className="os-ring r2"></div>
            <div className="os-core">
              <span>
                {latestWeek ? `WK ${latestWeek.week}` : "LIVE"}
                <br />
                LIVE
              </span>
            </div>

            <div className="os-chips-layer" id="osChipsLayer">
              {heroChips.map((chip, i) => (
                <div
                  className="os-chip"
                  key={`${chip.name}-${i}`}
                  style={{ "--ang": CHIP_SLOTS[i].ang, "--r": CHIP_SLOTS[i].r }}
                >
                  <div className="chip-inner">
                    {chip.name} <span className={chip.dir}>{chip.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="wrap">
        <LandingHub />

        <section id="tools">
          <div className="section-head reveal">
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

          <div className="rounds">
            <div className="round-card reveal">
              <div className="round-label">Free</div>
              <h3>Stargazer</h3>
              <div className="round-price">$0</div>
              <div className="round-desc">Look at your leagues before you pay for anything.</div>
              <ul className="round-features">
                <li>Check any Sleeper account, save 1 league</li>
                <li>Weekly Projection Rankings (top 50)</li>
                <li>Season simulations (top 10)</li>
                <li>Compare up to 3 players (top 50)</li>
                <li>
                  Dynasty and prospect previews <em className="round-soon">Soon</em>
                </li>
                <li>Newsletter and Discord</li>
              </ul>
              <a href="/login" className="round-btn outline" data-plan="stargazer">
                Become a Stargazer
              </a>
            </div>

            <div className="round-card featured reveal d1">
              <div className="round-label">Run every league</div>
              <div className="round-title-row">
                <h3>Explorer</h3>
                <span className="round-badge round-badge-gold">MOST POPULAR</span>
              </div>
              <div className="round-price">
                <sup>$</sup>
                <span className="price-amt" data-monthly="9" data-annual="7">
                  7
                </span>
                <sub>/mo</sub>
              </div>
              <div className="round-bill" data-monthly="billed monthly" data-annual="$84 billed yearly">
                $84 billed yearly
              </div>
              <div className="round-desc">All your leagues, saved and watched.</div>
              <ul className="round-features">
                <li>Everything in Stargazer</li>
                <li>Up to 10 leagues, saved and auto-refreshed</li>
                <li>Exposure map across every league, plus buy-ins at risk</li>
                <li>
                  &ldquo;Your Players This Week&rdquo; email and Sunday lineup alert <em className="round-soon">Soon</em>
                </li>
                <li>Every player in the weekly rankings, and full compare</li>
                <li>
                  Full dynasty rankings and the rookie draft board <em className="round-soon">Soon</em>
                </li>
                <li>
                  Full prospect rankings <em className="round-soon">Soon</em>
                </li>
                <li>Special Discord role</li>
              </ul>
              <a href="#" className="round-btn primary" data-plan="explorer">
                Become an Explorer
              </a>
              <p className="round-assure">14-day refund · cancel anytime</p>
            </div>

            <div className="round-card reveal d2">
              <div className="round-label">Full Access</div>
              <div className="round-title-row">
                <h3>Singularity</h3>
                <span className="round-badge round-badge-blue">
                  {singularityRemaining > 0
                    ? `${singularityRemaining} FOUNDING SPOTS LEFT`
                    : "FOUNDING SPOTS FULL"}
                </span>
              </div>
              <div className="round-price">
                <sup>$</sup>
                <span className="price-amt" data-monthly="25" data-annual="20">
                  20
                </span>
                <sub>/mo</sub>
              </div>
              <div className="round-bill" data-monthly="billed monthly" data-annual="$240 billed yearly">
                $240 billed yearly
              </div>
              <div className="round-desc">
                {`Every player's full range, for the leagues where the edge decides it. Only ${SINGULARITY_FOUNDING_CAP} founding spots — ${singularityRemaining} remaining.`}
              </div>
              <ul className="round-features">
                <li>Everything in Explorer</li>
                <li>Unlimited leagues</li>
                <li>Full season simulations: every player&apos;s floor, median and ceiling</li>
                <li>Pace, percentile shapes, and role and career-stage tags</li>
                <li>
                  Personal Team Analysis <em className="round-soon">Soon</em>
                </li>
                <li>CSV export of every list</li>
                <li>Priority Discord and early beta access</li>
              </ul>
              <a href="#" className="round-btn outline" data-plan="singularity">
                Reach Singularity
              </a>
              <p className="round-assure">14-day refund · cancel anytime</p>
            </div>
          </div>

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
            <div className="eyebrow blue">The Feed</div>
            <h2>Cutting-edge dynasty &amp; fantasy football, in your inbox.</h2>
            <p>
              Model notes, ranking shifts, and rookie-comp breakdowns —
              written for dynasty and best ball players who want an edge
              sharper than the mock consensus, delivered every Tuesday before
              waivers process.
            </p>
          </div>

          <div className="feed-grid">
            <form className="feed-form reveal" id="feedForm">
              <label className="feed-label mono" htmlFor="feedEmail">
                EMAIL ADDRESS
              </label>
              <div className="feed-input-row">
                <input
                  type="email"
                  id="feedEmail"
                  className="feed-input"
                  placeholder="you@domain.com"
                  required
                />
                <button type="submit" className="btn-primary feed-submit">
                  Subscribe
                </button>
              </div>
              <p className="feed-fineprint">
                No spam. Unsubscribe anytime. One email a week, regressed for
                relevance.
              </p>
              <p className="feed-success mono">
                Signal locked. Check your inbox next Tuesday.
              </p>
            </form>

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

      <footer>
        <div className="wrap">
          <div className="fbrand">Singularity Dynasty</div>
          <div className="flinks">
            <a href="#tools">Tools</a>
            <a href="#pricing">Pricing</a>
            <a href="/contact">Contact</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/disclaimer">Disclaimer</a>
          </div>
          <div className="fcoord mono">VOID // #07070C</div>
          <div className="fsmall">
            © 2026 Singularity Dynasty. Not affiliated with the NFL or any
            fantasy football platform. Content is for informational and
            entertainment purposes only and is not intended for use in
            gambling, betting, or wagering of any kind — see our{" "}
            <Link href="/disclaimer">Disclaimer</Link>.
          </div>
        </div>
      </footer>
    </>
  );
}
