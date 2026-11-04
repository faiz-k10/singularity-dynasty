import Link from "next/link";
import SiteHeader from "../SiteHeader";
import OutcomeCurveDetail from "../tools/OutcomeCurveDetail";
import Define from "../Define";

export const metadata = {
  title: "How It Works — Singularity Dynasty",
  description:
    "How Singularity Dynasty's floor, median and ceiling projections and season simulations are built, how often they're right, where the data comes from, and answers to common questions.",
};

// The methods page: how to read a range, how each number is made, how often it's right (the backtests, quoted with what they were
// tested on and their limits), sources, schedule, and the FAQ. Every figure here comes from a backtest recorded in CLAUDE.md; when
// a model changes, update its row in TRACK_RECORD.
const TRACK_RECORD = [
  {
    claim: "Weekly ceiling",
    aim: "About 1 game in 10 beats it",
    result: "10.0% to 10.2% of real games beat it; 8.7% to 11.5% on 2026 games it was not tuned on",
    tested: "Every QB, RB, WR and TE game, 2022 to 2025, plus 2026 weeks 1 to 6",
  },
  {
    claim: "Season floor and ceiling",
    aim: "About 1 healthy player in 10 below the floor, 1 in 10 above the ceiling",
    result: "10% to 11% at each end",
    tested: "Seasons the model had not seen (out of sample), 2022 to 2025",
  },
  {
    claim: "Start / sit on close calls",
    aim: "Pick the player who scores more",
    result: "Higher median: 54.4% right. Higher median plus the Smash / Tough Spot: 65.5% when one of the two is flagged",
    tested: "About 43,000 same-position pairs within 2 points, 2026 weeks 1 to 6",
  },
  {
    claim: "Smash / Tough Spots",
    aim: "Flag matchups that really move scoring",
    result: "Smash Spot players beat their median by 2.5 points on average; Tough Spot players fell 2.3 short; unflagged players 0.0",
    tested: "2026 weeks 1 to 6 as published",
  },
  {
    claim: "Playoff odds",
    aim: "A team given X% makes it about X% of the time",
    result: "After week 5: teams given 5% or less made it 2% of the time; 95% or more, 96.8%",
    tested: "327 completed Sleeper league-seasons (about 3,800 teams), 2022 to 2025",
  },
  {
    claim: "Win chance before kickoff",
    aim: "Pick winners, with honest percentages",
    result: "Picks the winner 69.5% of the time; percentages close to what happened (a mildly confident lean)",
    tested: "210 real head-to-head matchups, 2026 weeks 1 to 7. A small sample: read it as supportive, not proven",
  },
  {
    claim: "Live win chance",
    aim: "Points still to come don't depend on how a player started",
    result: "Confirmed: a fast or slow first half changes nothing about the second (the measured effect is about zero)",
    tested: "1,136 starter games rebuilt play by play at halftime and after the 3rd quarter, 2026",
  },
];

const FAQ = [
  ["Is this for betting?", <>No. Everything here is for fantasy football roster decisions, and it isn&apos;t intended for gambling or wagering of any kind. See the <Link href="/disclaimer">Disclaimer</Link>.</>],
  ["What scoring do the projections use?", "Full PPR (1 point per catch). On My Team, live points use your own league's scoring, straight from Sleeper."],
  ["Which fantasy platforms work?", "Sleeper today. Look up any Sleeper username without an account; save leagues with a free account."],
  ["Do you change anything in my Sleeper account?", "Never. We only read your public leagues, rosters and matchups. Lineup changes are always made by you, in Sleeper."],
  ["What's free and what's paid?", <>Stargazer is free: 1 saved league, the top 50 weekly rankings and the top 10 season simulations. Explorer adds up to 10 live leagues and every player; Singularity adds everything. <Link href="/#pricing">Compare plans</Link>.</>],
  ["Can I switch plans?", "Yes. Account, then Manage Billing, then change your plan. The difference is prorated automatically."],
  ["How do I cancel?", "Account, then Manage Billing, then Cancel. You keep everything until the end of the period you paid for and aren't charged again."],
  ["Do you offer refunds?", <>Yes, within 14 days of a payment. <Link href="/contact">Contact us</Link> and we&apos;ll take care of it.</>],
  ["Why did a projection change in the middle of the week?", "Projections publish Tuesday and refresh Thursday afternoon and Sunday morning for injury news. A player ruled out drops to 0."],
  ["Why does a player show 0?", "Either he's ruled out (an injury designation, or no projection anywhere because he won't play) or his team is on its BYE. The site always says which."],
  ["How does Refer a friend work?", <>Your link is on your <Link href="/account">Account</Link> page. A friend who signs up through it gets 20% off their first payment. When they subscribe, you get a free month of your plan as account credit, taken off your next bill automatically (if you&apos;re on the free plan, it waits for when you subscribe). First-time subscribers only, up to 12 rewards a year.</>],
  ["How do I delete my account and data?", "Account, then Delete account. It cancels any subscription immediately and removes your login, saved leagues and settings."],
  ["Something looks wrong. Who do I tell?", <><Link href="/contact">Contact us</Link>. Errors on the site are also recorded automatically so we can fix them.</>],
];

export default function HowItWorksPage() {
  return (
    <div className="auth-page">
      <SiteHeader />
      <main id="main-content" className="wrap doc-wrap">
        <div className="eyebrow">Help</div>
        <h1 className="doc-h1">How It Works</h1>
        <p className="doc-lede">
          Every player gets a range, not a guess: a <strong>floor</strong>, a <strong>median</strong> and a <strong>ceiling</strong>, built from real games and
          checked against what actually happened. Here&apos;s how the numbers are made, how often they&apos;re right, and where they come from.
        </p>
        <nav className="doc-jump" aria-label="On this page">
          {[["#read", "Reading a range"], ["#made", "How it's made"], ["#record", "Track record"], ["#sources", "Data and schedule"], ["#faq", "FAQ"]].map(([href, label]) => (
            <a key={href} href={href} className="doc-chip mono">
              {label}
            </a>
          ))}
        </nav>

        <section id="read" className="doc-section" aria-labelledby="h-read">
          <h2 id="h-read" className="doc-h2">Reading a range</h2>
          <div className="doc-split">
            <div>
              <p>Take a receiver projected for 14.8 points this week. His range says:</p>
              <ul className="doc-list">
                <li>
                  <Define term="floor">Floor</Define> <strong>7.2</strong>: about 1 week in 10 he scores this or less.
                </li>
                <li>
                  <Define term="projection-median">Median</Define> <strong>14.8</strong>: half his weeks land above, half below. It&apos;s the most even bet, not a promise.
                </li>
                <li>
                  <Define term="ceiling">Ceiling</Define> <strong>25.6</strong>: about 1 week in 10 he reaches this or more.
                </li>
              </ul>
              <p>
                Two players with the same median can be very different starts: a narrow range is a safe floor, a wide one is a swing for the ceiling. The curve
                shows that shape at a glance.
              </p>
            </div>
            <figure className="doc-figure">
              <OutcomeCurveDetail floor={7.2} median={14.8} ceiling={25.6} maxSpread={18.4} />
              <figcaption className="mono">An example receiver: floor zone left, ceiling zone right, the hump where most weeks land.</figcaption>
            </figure>
          </div>
        </section>

        <section id="made" className="doc-section" aria-labelledby="h-made">
          <h2 id="h-made" className="doc-h2">How the numbers are made</h2>
          <div className="doc-cards">
            <article className="doc-card">
              <h3>Weekly projections</h3>
              <p>
                Each player&apos;s recent games, weighted toward the latest, give his scoring range. That&apos;s blended with Sleeper&apos;s weekly projection by position
                (each position&apos;s blend was chosen by testing it on two full seasons). A game where he was on the field and touched nothing counts as a real 0.
                Injury designations and byes drop him to 0, and say why.
              </p>
            </article>
            <article className="doc-card">
              <h3>Season simulations</h3>
              <p>
                The rest of the season is played out thousands of times for every player. What he has already scored is locked in; only the games left are
                simulated. The median assumes he plays every remaining game, and the floor and ceiling were calibrated so each end is crossed about 1 time in 10.
              </p>
            </article>
            <article className="doc-card">
              <h3>Matchups</h3>
              <p>
                A two-way model of offense against defense, adjusted for who each team has played, finds defenses with a real, repeated lean against a position.
                Only the strongest become <Define term="smash-spot">Smash</Define> or <Define term="tough-spot">Tough</Define> Spots. They&apos;re shown beside the
                projection rather than baked into it, so you can see the effect.
              </p>
            </article>
            <article className="doc-card">
              <h3>Rookies</h3>
              <p>
                A rookie is projected from his very first game: his own games are blended with what past rookies drafted in the same range scored at his position,
                and his own games take over as they pile up.
              </p>
            </article>
            <article className="doc-card">
              <h3>Dynasty values</h3>
              <p>
                <Define term="production-over-replacement">Production over replacement</Define> (his last 34 games for a contender, his last 17 for a rebuilder, recent ones weighted most) blended with
                <Define term="age-value"> age value</Define> (how much production players of his position and age keep over three seasons). Contenders weight
                production 80/20, rebuilders 50/50. Tiers break only where the gap is statistically real.
              </p>
            </article>
            <article className="doc-card">
              <h3>My Team</h3>
              <p>
                Your matchups are scored live: points on the board are locked in, and each starter still to play is simulated from his range for the part of the
                game left. Playoff odds play the rest of your league&apos;s season out thousands of times.
              </p>
            </article>
          </div>
        </section>

        <section id="record" className="doc-section" aria-labelledby="h-record">
          <h2 id="h-record" className="doc-h2">Track record</h2>
          <p>
            Every model on the site was tested on games it hadn&apos;t seen before it went live. These are the results, with what each was tested on. We
            publish the misses too: a number that&apos;s right about as often as it says is worth more than one that sounds confident.
          </p>
          <div className="rankings-table-wrap doc-table">
            <table className="rankings-table">
              <caption className="sr-only">How often each number is right, and what it was tested on</caption>
              <thead>
                <tr>
                  <th scope="col">Number</th>
                  <th scope="col">What it aims for</th>
                  <th scope="col">What we measured</th>
                  <th scope="col">Tested on</th>
                </tr>
              </thead>
              <tbody>
                {TRACK_RECORD.map((r) => (
                  <tr key={r.claim}>
                    <th scope="row">{r.claim}</th>
                    <td>{r.aim}</td>
                    <td>{r.result}</td>
                    <td className="doc-dim">{r.tested}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            And every finished week is graded in public: <Link href="/receipts">this week&apos;s receipts</Link> show how many players landed inside their
            range and how the Smash / Tough Spots did.
          </p>
        </section>

        <section id="sources" className="doc-section" aria-labelledby="h-sources">
          <h2 id="h-sources" className="doc-h2">Data and schedule</h2>
          <div className="doc-split">
            <div>
              <h3 className="doc-h3">Where the data comes from</h3>
              <ul className="doc-list">
                <li><strong>nflverse</strong>: the open NFL play-by-play and player statistics behind every model.</li>
                <li><strong>Sleeper</strong>: your leagues, rosters and matchups (read only), and its weekly projections, blended into ours.</li>
                <li><strong>ESPN</strong>: live scores and plays on game days.</li>
              </ul>
              <p className="doc-dim">Not affiliated with the NFL, Sleeper or ESPN.</p>
            </div>
            <div>
              <h3 className="doc-h3">When things update</h3>
              <ul className="doc-list">
                <li><strong>Tuesday, midday ET</strong>: the new week&apos;s projections, rankings and season simulations.</li>
                <li><strong>Thursday afternoon and Sunday morning</strong>: refreshed for injury news.</li>
                <li><strong>Game days</strong>: My Team updates every 15 seconds while games are on.</li>
                <li><strong>Draft board and prospects</strong>: through the offseason and draft season.</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="faq" className="doc-section" aria-labelledby="h-faq">
          <h2 id="h-faq" className="doc-h2">Frequently asked questions</h2>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q} className="faq-item">
                <summary>{q}</summary>
                <div className="faq-a">{a}</div>
              </details>
            ))}
          </div>
          <p className="doc-dim">
            Still stuck? <Link href="/contact">Contact us</Link>. For any term on the site, see the <Link href="/glossary">Glossary</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
