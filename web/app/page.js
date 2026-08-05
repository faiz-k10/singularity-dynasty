import Link from "next/link";
import InteractiveScript from "./InteractiveScript";
import ThemeToggle from "./ThemeToggle";
import { createClient } from "@/lib/supabase/server";

function formatPostDate(iso) {
  return new Date(iso)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase();
}

export default async function Home() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: posts },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("posts")
      .select("id, title, url, published_at")
      .order("published_at", { ascending: false })
      .limit(3),
  ]);

  // Ticker: real RISING/FALLING/STEADY data from the latest published
  // redraft_rankings week (free-for-everyone table, so this always has the
  // broadest player pool available). Falls back to InteractiveScript's own
  // randomized sample if nothing's published yet.
  const { data: latestRedraft } = await supabase
    .from("redraft_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  let tickerPlayers = [];
  if (latestRedraft) {
    const { data: tickerRows } = await supabase
      .from("redraft_rankings")
      .select("player_name, trend")
      .eq("season", latestRedraft.season)
      .eq("week", latestRedraft.week)
      .not("trend", "is", null)
      .order("rank", { ascending: true })
      .limit(50);
    tickerPlayers = (tickerRows || []).map((r) => ({ name: r.player_name, trend: r.trend }));
  }

  return (
    <>
      <div className="ticker-bar">
        <div className="ticker-track" id="tickerTrack"></div>
      </div>

      <ThemeToggle />
      <button
        className="menu-btn"
        id="menuBtn"
        aria-label="Open menu"
        aria-expanded="false"
      >
        ☰
      </button>

      <header className="site-header">
        <a href="#hero" className="brandmark">
          <span className="ring"></span>Singularity Dynasty
        </a>
        <nav className="top-nav-bar" id="topNavBar" aria-label="Primary">
          <a href="#hero">Signal</a>
          <a href="#tools">Tools</a>
          <a href="#pricing">Pricing</a>
          <a href="#feed">Feed</a>
          <a href="#playground">Play</a>
          <a href={user ? "/account" : "/login"}>
            {user ? "Account" : "Sign In"}
          </a>
          <a href="#pricing" className="tn-cta">
            Get Started
          </a>
        </nav>
      </header>

      <div className="radial-menu" id="radialMenu">
        <nav>
          <a href="#hero">Signal</a>
          <a href="#tools">Tools</a>
          <a href="#pricing">Pricing</a>
          <a href="#feed">Feed</a>
          <a href="#playground">Play</a>
          <a href={user ? "/account" : "/login"}>
            {user ? "Account" : "Sign In"}
          </a>
          <a href="#pricing" className="rm-cta">
            Get Started →
          </a>
        </nav>
      </div>

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
                WK 09
                <br />
                LIVE
              </span>
            </div>

            <div className="os-chips-layer" id="osChipsLayer">
              <div className="os-chip" style={{ "--ang": "-90deg", "--r": "150px" }}>
                <div className="chip-inner">
                  CeeDee Lamb <span className="up">98.4 ▲</span>
                </div>
              </div>
              <div className="os-chip" style={{ "--ang": "-18deg", "--r": "150px" }}>
                <div className="chip-inner">
                  Bijan Robinson <span className="up">95.1 ▲</span>
                </div>
              </div>
              <div className="os-chip" style={{ "--ang": "54deg", "--r": "150px" }}>
                <div className="chip-inner">
                  Justin Fields <span className="down">41.0 ▼</span>
                </div>
              </div>
              <div className="os-chip" style={{ "--ang": "126deg", "--r": "150px" }}>
                <div className="chip-inner">
                  Marvin Harrison Jr. <span className="up">88.7 ▲</span>
                </div>
              </div>
              <div className="os-chip" style={{ "--ang": "198deg", "--r": "150px" }}>
                <div className="chip-inner">
                  Best Ball ADP <span className="up">+12 picks ▲</span>
                </div>
              </div>
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
                <Link href="/tools/player-simulations" className="hub-panel-link">
                  View Live Simulations →
                </Link>
              </div>

              <div className="hub-panel" data-panel="1">
                <span className="hub-tag">CEILING-WEIGHTED</span>
                <h3>Best Ball Rankings</h3>
                <p>
                  Rankings tuned specifically for best ball formats,
                  regression-weighted for weekly ceiling and variance instead
                  of week-to-week consistency.
                </p>
                <div className="mock-panel" style={{ marginTop: "18px" }}>
                  <div className="mock-head">
                    <h4>Best Ball Rankings</h4>
                    <span className="mono">CEILING-WEIGHTED</span>
                  </div>
                  <div className="board-row">
                    <span className="board-rank">1</span>
                    <span className="board-name">
                      Ja&apos;Marr Chase <span className="board-pos">WR</span>
                    </span>
                    <span className="board-tier tier-s">S</span>
                  </div>
                  <div className="board-row">
                    <span className="board-rank">2</span>
                    <span className="board-name">
                      Puka Nacua <span className="board-pos">WR</span>
                    </span>
                    <span className="board-tier tier-s">S</span>
                  </div>
                  <div className="board-row">
                    <span className="board-rank">3</span>
                    <span className="board-name">
                      Bijan Robinson <span className="board-pos">RB</span>
                    </span>
                    <span className="board-tier tier-s">S</span>
                  </div>
                </div>
                <ul className="feature-list blue">
                  <li>Ceiling-weighted by standard deviation, not median consistency</li>
                  <li>Recalculated weekly as sample size grows</li>
                </ul>
                <Link href="/tools/best-ball-rankings" className="hub-panel-link">
                  View Live Rankings →
                </Link>
              </div>

              <div className="hub-panel" data-panel="2">
                <span className="hub-tag">ROUND-BY-ROUND</span>
                <h3>Dynasty Draft Board</h3>
                <p>
                  A full startup and rookie draft board, laid out round by
                  round, with correlated stacks auto-flagged via
                  roster-construction analysis.
                </p>
                <Link href="/tools/draft-board" className="hub-panel-link">
                  View Live Board →
                </Link>
              </div>

              <div className="hub-panel" data-panel="3">
                <span className="hub-tag">MATCHUP-ADJUSTED</span>
                <h3>Redraft Weekly Rankings</h3>
                <p>
                  Standard redraft rankings refreshed every week of the
                  season, adjusted for opponent-strength and matchup
                  efficiency data.
                </p>
                <div className="mock-panel" style={{ marginTop: "18px" }}>
                  <div className="mock-head">
                    <h4>Redraft Weekly Rankings</h4>
                    <span className="mono">WEEK 09</span>
                  </div>
                  <div className="board-row">
                    <span className="board-rank">1</span>
                    <span className="board-name">
                      Christian McCaffrey <span className="board-pos">RB</span>
                    </span>
                    <span className="board-tier tier-s">S</span>
                  </div>
                  <div className="board-row">
                    <span className="board-rank">2</span>
                    <span className="board-name">
                      Justin Jefferson <span className="board-pos">WR</span>
                    </span>
                    <span className="board-tier tier-s">S</span>
                  </div>
                  <div className="board-row">
                    <span className="board-rank">3</span>
                    <span className="board-name">
                      Josh Allen <span className="board-pos">QB</span>
                    </span>
                    <span className="board-tier tier-a">A</span>
                  </div>
                </div>
                <ul className="feature-list gold">
                  <li>Refreshed every week, not just at the start of the season</li>
                  <li>Adjusted for opponent-strength and matchup efficiency</li>
                </ul>
                <Link href="/tools/redraft-rankings" className="hub-panel-link">
                  View Live Rankings →
                </Link>
              </div>

              <div className="hub-panel" data-panel="4">
                <span className="hub-tag">AGE-CURVE REGRESSION</span>
                <h3>Team Analysis</h3>
                <p>
                  A full regression breakdown of your roster&apos;s age
                  curve, positional depth, and contention window, generated
                  automatically from your team.
                </p>
              </div>

              <div className="hub-panel" data-panel="5">
                <span className="hub-tag">PERCENTILE COMPS</span>
                <h3>WR/QB Prospect Rankings &amp; Comparisons</h3>
                <p>
                  Incoming rookie rankings for wide receivers and
                  quarterbacks, with side-by-side statistical comps against
                  past prospects using athletic and production percentiles.
                </p>
                <Link href="/tools/prospect-rankings" className="hub-panel-link">
                  View Live Board →
                </Link>
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
                  data-panel="1"
                  style={{ "--nx": "-289px", "--ny": "24px" }}
                >
                  <span className="node-label">Best Ball Rankings</span>
                </button>
                <button
                  className="node"
                  data-panel="2"
                  style={{ "--nx": "-97px", "--ny": "3px" }}
                >
                  <span className="node-label">Dynasty Draft Board</span>
                </button>
                <button
                  className="node"
                  data-panel="3"
                  style={{ "--nx": "97px", "--ny": "3px" }}
                >
                  <span className="node-label">Redraft Weekly Rankings</span>
                </button>
                <button
                  className="node"
                  data-panel="4"
                  style={{ "--nx": "289px", "--ny": "24px" }}
                >
                  <span className="node-label">Team Analysis</span>
                </button>
                <button
                  className="node"
                  data-panel="5"
                  style={{ "--nx": "477px", "--ny": "67px" }}
                >
                  <span className="node-label">WR/QB Prospect Rankings &amp; Comparisons</span>
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
                <li>Weekly dynasty rankings (top 200)</li>
                <li>Redraft weekly rankings</li>
                <li>Basic waiver wire watchlist</li>
                <li>1 saved team</li>
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
                <li>Full dynasty rankings &amp; tiers (500+ players)</li>
                <li>Dynasty draft board</li>
                <li>Best ball rankings</li>
                <li>5 saved teams</li>
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
                <span className="price-amt" data-monthly="24" data-annual="19">
                  24
                </span>
                <sub>/mo</sub>
              </div>
              <div className="round-desc">The endpoint. Everything converges here.</div>
              <ul className="round-features">
                <li>Everything in Explorer</li>
                <li>Team analysis</li>
                <li>Player season simulations</li>
                <li>QB/WR prospect rankings &amp; comparisons</li>
                <li>Unlimited saved teams</li>
                <li>CSV data export</li>
                <li>Early access to new tools</li>
                <li>Priority Discord access</li>
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

      <InteractiveScript tickerPlayers={tickerPlayers} />
    </>
  );
}
