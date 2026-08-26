import Link from "next/link";
import SiteHeader from "./SiteHeader";
import { createClient } from "@/lib/supabase/server";

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

export default async function Home() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, url, published_at")
    .order("published_at", { ascending: false })
    .limit(3);

  const { data: latestWeek } = await supabase
    .from("redraft_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  let topRedraft = [];
  const heroCandidates = [];

  if (latestWeek) {
    const { data } = await supabase
      .from("redraft_rankings")
      .select("rank, player_name, position, projection")
      .eq("season", latestWeek.season)
      .eq("week", latestWeek.week)
      .order("rank", { ascending: true })
      .limit(3);
    topRedraft = data || [];

    // Same RISING/FALLING trend field the ticker uses (SiteHeader.js) --
    // real week-over-week movement, not a fabricated stat.
    const { data: trendRows } = await supabase
      .from("redraft_rankings")
      .select("player_name, trend, projection")
      .eq("season", latestWeek.season)
      .eq("week", latestWeek.week)
      .in("trend", ["RISING", "FALLING"])
      .limit(30);

    for (const r of trendRows || []) {
      heroCandidates.push({
        name: r.player_name,
        value: `${r.projection.toFixed(1)} ${r.trend === "RISING" ? "▲" : "▼"}`,
        dir: r.trend === "RISING" ? "up" : "down",
      });
    }
  }

  const { data: simSeasonRow } = await supabase
    .from("player_simulations")
    .select("season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (simSeasonRow) {
    const { data: simRows } = await supabase
      .from("player_simulations")
      .select("player_name, floor, median, ceiling")
      .eq("season", simSeasonRow.season)
      .limit(30);

    // Boom/bust lean from the simulation's own shape -- more ceiling
    // upside than floor downside reads "up", the reverse reads "down".
    // Real derived signal, not an invented number.
    for (const r of simRows || []) {
      const upside = r.ceiling - r.median;
      const downside = r.median - r.floor;
      const isUp = upside >= downside;
      heroCandidates.push({
        name: r.player_name,
        value: `${Math.round(isUp ? r.ceiling : r.floor)} ${isUp ? "▲" : "▼"}`,
        dir: isUp ? "up" : "down",
      });
    }
  }

  const heroChips = shuffle(heroCandidates).slice(0, CHIP_SLOTS.length);

  return (
    <>
      <SiteHeader />

      <nav className="orbit-nav" id="orbitNav">
        <a
          href="#hero"
          className="orbit-dot active"
          data-label="Signal"
          aria-label="Signal section"
        ></a>
        <a
          href="#tools"
          className="orbit-dot"
          data-label="Tools"
          aria-label="Tools section"
        ></a>
        <a
          href="#pricing"
          className="orbit-dot"
          data-label="Pricing"
          aria-label="Pricing section"
        ></a>
        <a
          href="#feed"
          className="orbit-dot"
          data-label="Feed"
          aria-label="Feed section"
        ></a>
        <a
          href="#playground"
          className="orbit-dot"
          data-label="Play"
          aria-label="Playground section"
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
              Every stat, every trend —<br />
              pulled toward one
              <br />
              <span>endpoint</span>.
            </h1>
            <p className="lede">
              Singularity Dynasty runs rankings, prospect grades, and Monte
              Carlo season simulations through the same regression models,
              distilling thousands of data points into one clear number. No
              noise, no small-sample bias — just signal.
            </p>
            <div className="hero-ctas">
              <a href="#pricing" className="btn-primary">
                See Pricing
              </a>
              <a href="#tools" className="btn-ghost">
                Explore the Tools
              </a>
            </div>
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
                  key={chip.name}
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
                <h3>Redraft Weekly Rankings</h3>
                <Link href="/tools/redraft-rankings" className="hub-panel-link">
                  View Live Rankings →
                </Link>
                <p>
                  Standard redraft rankings refreshed every week of the
                  season, adjusted for opponent-strength and matchup
                  efficiency data.
                </p>
                <div className="mock-panel" style={{ marginTop: "18px" }}>
                  <div className="mock-head">
                    <h4>Redraft Weekly Rankings</h4>
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
                  <span className="node-label">Redraft Weekly Rankings</span>
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
              className="toggle"
              id="billingToggle"
              aria-label="Toggle annual billing"
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
              <div className="round-desc">Enough to get a real read on your team.</div>
              <ul className="round-features">
                <li>Weekly Projection Rankings (Top 100)</li>
                <li>Access to the Newsletter</li>
                <li>Access to Discord</li>
              </ul>
              <a href="#" className="round-btn outline" data-plan="stargazer">
                Become a Stargazer
              </a>
            </div>

            <div className="round-card featured reveal d1">
              <div className="round-label">Standard Access</div>
              <h3>Explorer</h3>
              <div className="round-price">
                <sup>$</sup>
                <span className="price-amt" data-monthly="9" data-annual="7">
                  9
                </span>
                <sub>/mo</sub>
              </div>
              <div className="round-desc">
                Full rankings, full draft tools, no ceiling on teams.
              </div>
              <ul className="round-features">
                <li>Everything in Stargazer</li>
                <li>Full Dynasty Rankings</li>
                <li>Full Weekly Projection Rankings</li>
                <li>2025 Prospect Rankings</li>
                <li>Special Discord Role</li>
              </ul>
              <a href="#" className="round-btn primary" data-plan="explorer">
                Become an Explorer
              </a>
            </div>

            <div className="round-card reveal d2">
              <div className="round-label">Full Access</div>
              <h3>Singularity</h3>
              <div className="round-price">
                <sup>$</sup>
                <span className="price-amt" data-monthly="25" data-annual="20">
                  25
                </span>
                <sub>/mo</sub>
              </div>
              <div className="round-desc">The endpoint. Everything converges here.</div>
              <ul className="round-features">
                <li>Everything in Explorer</li>
                <li>Full Player Simulation Rankings</li>
                <li>Full QB/WR Prospect Rankings &amp; Comparisons</li>
                <li>Personal Team Analysis</li>
                <li>Shoutout in the Newsletter</li>
                <li>Priority Discord Channel &amp; Role</li>
                <li>Early Beta Access to New Tools</li>
                <li>Free Data Export</li>
              </ul>
              <a href="#" className="round-btn outline" data-plan="singularity">
                Reach Singularity
              </a>
            </div>
          </div>

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

      <section id="playground">
        <div className="wrap">
          <div className="section-head reveal">
            <div className="eyebrow blue">Try It</div>
            <h2>Click anywhere. Watch it collapse.</h2>
            <p>
              Every stat starts scattered. Click inside the field below and
              watch it get pulled toward the number that matters — exactly
              how our models treat your data.
            </p>
          </div>
          <div className="playground-frame reveal">
            <canvas id="gravityCanvas" className="gravity-canvas"></canvas>
            <div className="playground-hint mono">CLICK TO DROP A DATA POINT</div>
            <div className="playground-counter mono">
              <span id="collapseCount">0</span> COLLAPSED
            </div>
          </div>
        </div>
      </section>

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
