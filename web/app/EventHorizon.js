"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import ArcGauge from "./ArcGauge";
import NewsletterForm from "./NewsletterForm";
import { lookupSleeperTeams } from "./my-team/actions";
import { summarizeLeagues } from "@/lib/heroLookup";
import { startCheckout } from "@/lib/startCheckout";
import { formatWin } from "@/lib/standing";
import { leadState } from "@/lib/leadState";
import { fmt1, fmt2 } from "@/lib/format";

// EVENT HORIZON -- the landing page for visitors (founder's pick, Nov 9 2026; the design before it is the git tag
// design-classic-2026-11-09). Calm by default; the memorable parts happen as you move:
//   arrive   an empty sky, then the horizon opens from a point, the ring fades in, the orbits draw themselves in
//   rest     the hole, the ring (the name + the live countdown to the next kickoff), four orbiting tools, a quiet starfield;
//            every nine seconds or so one ember speck spirals in and is gone; the stars drift a little with the pointer
//   hover    an orbiting tool shows one line about itself, nothing is printed until you ask
//   scroll   you fall in: the hole grows to fill the screen and the next section begins inside it; after that the hole
//            waits in the header as the logo
// The Sleeper lookup lives inside the hole and answers there. Styles: the "EVENT HORIZON LANDING" block in globals.css
// (every class starts with ehp-). Everything honours prefers-reduced-motion.

// horizon radius, px: 150 on a desktop, smaller on a phone so the ring (R + 30) fits the screen
const radiusFor = (w) => (w < 560 ? Math.max(104, Math.round((w - 120) / 2)) : 150);
const TILT = (-7 * Math.PI) / 180;
const TOOL_BODIES = [
  { n: "WEEKLY", say: "this week, in range", href: "/tools/redraft-rankings", rx: 280, ry: 96, a: -0.6, s: 70 },
  { n: "SEASON", say: "where the season is heading", href: "/tools/player-simulations", rx: 400, ry: 140, a: 1.1, s: 100 },
  { n: "DYNASTY", say: "who is really ahead", href: "/tools/draft-board", rx: 520, ry: 186, a: 2.7, s: 135 },
  { n: "OBSERVATORY", say: "plot any two numbers", href: "/tools/lab", rx: 640, ry: 232, a: 4.3, s: 175 },
];

// What orbits the hole. A visitor sees the four tools. A member with saved leagues sees THIS WEEK'S MATCHUPS instead (as on the
// classic landing page): one planet per league, its orbit set by the win chance -- a favoured matchup rides close to the hole,
// a long shot far out -- labelled with the league and the one-word reading; each opens the Game Board.
function bodiesFor(member) {
  const m = member?.matchups;
  if (!m?.length) return TOOL_BODIES;
  return [...m]
    .sort((a, b) => b.p - a.p)
    .map((x, i, all) => {
      const rx = 250 + (1 - x.p) * 420; // p = 1 at 250, p = 0 at 670
      return { n: x.name.length > 22 ? `${x.name.slice(0, 21)}…`.toUpperCase() : x.name.toUpperCase(), say: x.say, href: "/my-team", rx, ry: rx * 0.36, a: (i / all.length) * Math.PI * 2 - 0.6, s: 70 + i * 22 };
    });
}
const TOOLS = [
  ["Weekly Projection Rankings", "Every player's range this week, and the matchups that tilt it.", "Top 50 free", "/tools/redraft-rankings"],
  ["Player Season Simulations", "Where each player's season is heading, and how it has moved.", "Top 10 free", "/tools/player-simulations"],
  ["Dynasty Draft Board", "Production against age, tiered by who is truly ahead.", "Top 20 free", "/tools/draft-board"],
  ["The Observatory", "Any two numbers, every player, one chart.", "Top 50 free", "/tools/lab"],
  ["The Game Board", "Every league you play, live, on one screen.", "1 league free", "/my-team"],
];
const PLANS = [
  { id: "stargazer", name: "Stargazer", r: 230, say: "The top of every board and one saved league.", month: 0, year: 0 },
  { id: "explorer", name: "Explorer", r: 150, say: "Every player, ten leagues watched live, the Tuesday email.", month: 9, year: 7 },
  { id: "singularity", name: "Singularity", r: 76, say: "Every simulation, unlimited leagues, exports.", month: 25, year: 20 },
];

// a seeded random, so the sky is the same on every visit
function seeded(s) {
  let x = s;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647);
}

function countdown(iso) {
  if (!iso) return null;
  let s = Math.floor((Date.parse(iso) - Date.now()) / 1000);
  if (!(s > 0)) return null;
  const p = (v) => String(v).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`; // hours is the largest unit, however far off (e.g. 61:09:28)
}

function Sky({ size, nextKickoff, bodies }) {
  const { w, h } = size;
  const R = radiusFor(w);
  const k = Math.max(0.45, Math.min(1, w / 1300)); // orbits shrink on small screens
  const rnd = seeded(5);
  const stars = [];
  for (let i = 0; i < 150; i++) {
    let x = (rnd() - 0.5) * w * 1.1;
    let y = (rnd() - 0.5) * h * 1.1;
    // gentle lensing: light from behind the hole is pushed out toward the Einstein ring, so the sky thins around it
    const d = Math.hypot(x, y), E = 170, d2 = (d + Math.sqrt(d * d + 4 * E * E)) / 2, t = Math.atan2(y, x);
    x = d2 * Math.cos(t);
    y = d2 * Math.sin(t);
    stars.push({ x, y, r: Math.pow(rnd(), 3) * 1.5 + 0.35, o: 0.15 + rnd() * 0.45 });
  }
  const RR = R + 30, C = 2 * Math.PI * RR;
  const [clock, setClock] = useState(null);
  useEffect(() => {
    const tick = () => setClock(countdown(nextKickoff));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextKickoff]);
  const piece = clock ? ["Singularity Dynasty · kickoff in ", clock, " · "] : ["Singularity Dynasty · where the data reaches its endpoint · ", "", ""];
  return (
    <svg className="ehp-sky" viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} aria-hidden="true">
      <g className="ehp-stars">
        {stars.map((s, i) => (
          <circle key={i} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={s.r.toFixed(2)} fill="currentColor" fillOpacity={s.o.toFixed(2)} />
        ))}
      </g>
      {bodies.map((b, i) => {
        const rx = +(b.rx * k).toFixed(1), ry = +(b.ry * k).toFixed(1);
        const c = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
        return <ellipse key={b.n} className="ehp-orbit" style={{ "--c": c.toFixed(0), transitionDelay: `${1.4 + i * 0.25}s` }} rx={rx} ry={ry} transform="rotate(-7)" />;
      })}
      <g className="ehp-reveal" style={{ transitionDelay: "1.6s" }}>
        <circle r={R + 12} fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth=".6" />
        <defs>
          <path id="ehp-ring" d={`M0,${-RR} a${RR},${RR} 0 1,1 -0.01,0`} />
        </defs>
        <g className="ehp-spin">
          <text className="ehp-ringtext">
            <textPath href="#ehp-ring" textLength={(C - 10).toFixed(0)} lengthAdjust="spacing">
              {piece[0]}<tspan className="t">{piece[1]}</tspan>{piece[2]}
              {piece[0]}<tspan className="t">{piece[1]}</tspan>{piece[2]}
            </textPath>
          </text>
        </g>
      </g>
      <g className="ehp-infall" />
    </svg>
  );
}

// The four orbiting tools live in their own layer ABOVE the hole, drawn white with mix-blend-mode: difference, so a planet that
// passes in front of the disc turns negative (dark on the bone disc in dark mode, light on the ink disc in light mode, like a
// retrograde star chart) and stays clickable.
function Bodies({ size, bodies }) {
  const { w, h } = size;
  return (
    <svg className="ehp-sky ehp-bodies" viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}>
      {bodies.map((b, i) => (
        <a key={b.n + i} href={b.href} className="ehp-body" data-i={i} style={{ transitionDelay: `${2 + i * 0.25}s` }} aria-label={`${b.n.toLowerCase()}: ${b.say}`}>
          <circle r="26" fill="transparent" />
          <circle className="halo" r="15" />
          <circle className="dot" r="5.5" />
          <text x="18" y="4">{b.n}</text>
          <text className="say" x="18" y="23">{b.say}</text>
        </a>
      ))}
    </svg>
  );
}

// The Sleeper box inside the hole; the answer replaces the question in the same place. A member with saved leagues sees their
// week there instead (expected wins across their leagues, from the home page's loadYourWeek).
function HoleLookup({ signedIn, member }) {
  const [name, setName] = useState("");
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  function submit(e) {
    e.preventDefault();
    const u = name.trim();
    if (!u || pending) return;
    setError(null);
    start(async () => {
      try {
        const res = await lookupSleeperTeams(u);
        if (res.error) return setError(res.error);
        const summary = summarizeLeagues(res.teams);
        if (!summary.leagues) return setError("No leagues found for that name this season.");
        setAnswer({ who: res.sleeperUsername || u, summary });
        try {
          localStorage.setItem("sd-sleeper-user", res.sleeperUsername || u);
          localStorage.setItem("sd-league-count", String(summary.leagues));
        } catch {}
      } catch {
        setError("Couldn't reach Sleeper just now. Try again in a moment.");
      }
    });
  }
  // a member with saved leagues: their week, in the same place a visitor's answer appears
  if (member && !answer) {
    return (
      <div className="ehp-answer">
        <div className="ehp-k">Welcome back, {member.name}</div>
        <p className="ehp-big">
          {member.wins.toFixed(1)} <span className="ehp-of">of {member.of}</span>
        </p>
        <p className="ehp-line">wins to expect this week across your {member.leagues} {member.leagues === 1 ? "league" : "leagues"}</p>
        <Link className="ehp-holebtn" href="/my-team">Open the Game Board →</Link>
      </div>
    );
  }
  if (answer) {
    const s = answer.summary, m = s.matchups, top = s.exposure[0];
    return (
      <div className="ehp-answer" aria-live="polite">
        <div className="ehp-k">{answer.who}</div>
        <p className="ehp-big">
          {s.leagues} {s.leagues === 1 ? "league" : "leagues"}
        </p>
        {m && m.projected > 0 && (
          <p className="ehp-line">
            Projected to win <b>{m.wins}</b> of {m.projected} this week
          </p>
        )}
        {top && (
          <p className="ehp-line">
            Most exposed to <b>{top.name}</b>, in {top.leagues} of {s.leagues}
          </p>
        )}
        <Link className="ehp-holebtn" href={signedIn ? "/my-team" : "/login?next=/my-team"}>
          {signedIn ? "Open my leagues →" : "Save them, free →"}
        </Link>
        <button type="button" className="ehp-again" onClick={() => setAnswer(null)}>
          another name
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="ehp-k">Where the data ends</div>
      <h1 className="ehp-title">
        Every player falls to <em>one number.</em>
      </h1>
      <form className="ehp-form" onSubmit={submit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={pending ? "reading leagues…" : "Sleeper username"} aria-label="Your Sleeper username" autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={pending} />
        <button aria-label="Read my leagues" disabled={pending || !name.trim()}>→</button>
      </form>
      {error && <p className="ehp-err">{error}</p>}
    </>
  );
}

// A small planet with one more orbit ring per tool (1 for the first, 5 for the last), the planet drawn on the outermost ring.
function OrbitIcon({ rings }) {
  const rx = (k) => +(8 + k * 4.4).toFixed(1);
  const out = rx(rings - 1);
  return (
    <svg className="ehp-ico" viewBox="-28 -28 56 56" aria-hidden="true">
      <circle r="3.6" fill="currentColor" />
      {Array.from({ length: rings }, (_, k) => (
        <ellipse key={k} rx={rx(k)} ry={+(rx(k) * 0.42).toFixed(1)} fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth=".7" transform="rotate(-12)" />
      ))}
      <circle className="planet" cx={+(out * Math.cos(0.8)).toFixed(1)} cy={+(out * 0.42 * Math.sin(0.8)).toFixed(1)} r="2.6" fill="currentColor" transform="rotate(-12)" />
    </svg>
  );
}

// What a visitor sees in the Game Board section: a made-up week in the same structure as a member's (the leagues are invented and
// labelled as a sample), plus the lineup alerts the Game Board raises -- shown here only as an example of what it does.
const SAMPLE_ROWS = [
  { id: "s1", name: "Sunday Scaries", record: "5-3", opponent: "Gridiron Ghosts", live: false, mine: 118.4, opp: 112.1, p: 0.62, label: "Favored", tone: "mint" },
  { id: "s2", name: "The Long Snappers", record: "7-1", opponent: "Fourth & Goal", live: false, mine: 104.9, opp: 103.2, p: 0.52, label: "Toss-up", tone: "grey" },
  { id: "s3", name: "Dynasty Drifters", record: "3-5", opponent: "Waiver Wire Warriors", live: false, mine: 97.6, opp: 109.3, p: 0.31, label: "Underdog", tone: "grey" },
  { id: "s4", name: "Mile High Club", record: "2-6", opponent: "Bye Week Heroes", live: false, mine: 88.1, opp: 121.7, p: 0.07, label: "Long shot", tone: "red" },
];
const SAMPLE_ALERTS = [
  { league: "Sunday Scaries", text: "Your WR2 is listed questionable", fix: "Swap in your best bench receiver" },
  { league: "Dynasty Drifters", text: "An empty starting slot at RB2", fix: "Fill it before Sunday's kickoff" },
  { league: "The Long Snappers", text: "Your TE is on a bye this week", fix: "Start the next tight end on your bench" },
];

function Alerts({ items, sample }) {
  return (
    <div className="ehp-al">
      <div className="ehp-k">Lineup alerts{sample ? " · the Game Board flags problems like these before kickoff" : ""}</div>
      <ul>
        {items.map((a) => (
          <li key={a.league + a.text}>
            <span className="lg">{a.league}</span>
            <span className="tx">{a.text}</span>
            <span className="fx">{a.fix} →</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A tiny outcome curve for the weekly table: the hump, a cold-blue tick at the floor, an ink line at the median, an ember tick at the ceiling.
function MiniCurve({ floor: fl, median: m, ceiling: c }) {
  const w = 120, h = 28, x = (v) => +(2 + (v / 45) * (w - 4)).toFixed(1);
  let d = "";
  for (let i = 0; i <= 44; i++) {
    const v = fl - 6 + (i * (c - fl + 12)) / 44;
    const sd = v < m ? (m - fl) / 1.28 : (c - m) / 1.28;
    d += `${i ? " L" : "M"}${x(v)} ${(h - 2 - (h - 6) * Math.exp(-((v - m) ** 2) / (2 * sd * sd))).toFixed(1)}`;
  }
  return (
    <svg className="ehp-mini" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d} L${x(c + 6)} ${h - 2} L${x(fl - 6)} ${h - 2}Z`} fill="currentColor" fillOpacity=".09" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1={x(fl)} x2={x(fl)} y1={h - 9} y2={h - 1} stroke="var(--down)" strokeWidth="1.2" />
      <line x1={x(m)} x2={x(m)} y1="3" y2={h - 1} stroke="currentColor" strokeWidth="1" />
      <line x1={x(c)} x2={x(c)} y1={h - 9} y2={h - 1} stroke="var(--ehp-mark)" strokeWidth="1.2" />
    </svg>
  );
}

// A member's week inside the horizon: every league with the score (live) or the projection, the opponent and the chance to win
// -- the classic landing page's "Your matchups" table in this page's material.
function Matchups({ rows }) {
  return (
    <table className="ehp-mt">
      <thead>
        <tr>
          <th className="l">League</th>
          <th>You</th>
          <th>Them</th>
          <th className="l">Chance</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          if (r.bye) {
            return (
              <tr key={r.id}>
                <td className="l"><span className="lg">{r.name}</span><span className="sub">{r.record ? `${r.record} · ` : ""}bye week</span></td>
                <td colSpan={3} />
              </tr>
            );
          }
          const [me, them] = r.live ? leadState(r.mine, r.opp) : [null, null];
          const n = (v) => (v == null ? "—" : r.live ? fmt2(v) : fmt1(v));
          return (
            <tr key={r.id}>
              <td className="l">
                <span className="lg">{r.name}</span>
                <span className="sub">{r.record && <i>{r.record}</i>}vs {r.opponent || "—"}</span>
              </td>
              <td className={`num${me ? ` is-${me}` : ""}${r.live ? "" : " proj"}`}>{n(r.mine)}</td>
              <td className={`num${them ? ` is-${them}` : ""}${r.live ? "" : " proj"}`}>{n(r.opp)}</td>
              <td className={`l ch is-${r.tone || "grey"}`}>
                {r.p != null ? (
                  <span className="chrow">
                    <ArcGauge value={r.p} size={46} label={`${formatWin(r.p)} chance to win`} />
                    <span className="chtx">
                      <b>{r.label}</b>
                      <span>{formatWin(r.p)}</span>
                    </span>
                  </span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Plans() {
  const [on, setOn] = useState(1);
  const [yearly, setYearly] = useState(true);
  const [busy, setBusy] = useState(null);
  async function choose(id) {
    setBusy(id);
    try {
      await startCheckout(id, yearly ? "annual" : "monthly");
    } catch {
      alert("Something went wrong starting checkout. Please try again.");
      setBusy(null);
    }
  }
  return (
    <div className="ehp-wrap ehp-plans">
      <div>
        <div className="ehp-k">Plans</div>
        <h2 className="ehp-h">
          The closer you orbit, <em>the more you see.</em>
        </h2>
        <div className="ehp-bill" role="group" aria-label="Billing">
          <button type="button" className={yearly ? "" : "on"} onClick={() => setYearly(false)} aria-pressed={!yearly}>Monthly</button>
          <button type="button" className={yearly ? "on" : ""} onClick={() => setYearly(true)} aria-pressed={yearly}>Yearly · about 20% off</button>
        </div>
        <div className="ehp-pd">
          {PLANS.map((p, i) => (
            <div key={p.id} className={i === on ? "on" : ""} onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)}>
              <b>{p.name}</b>
              <span>{p.say}</span>
              <em>{p.month ? `$${yearly ? p.year : p.month} / mo` : "Free"}</em>
              <button type="button" onClick={() => choose(p.id)} disabled={busy === p.id}>
                {busy === p.id ? "…" : p.month ? "Choose →" : "Start →"}
              </button>
            </div>
          ))}
        </div>
        <p className="ehp-fine">{yearly ? "Billed yearly: Explorer $84, Singularity $240." : "Billed monthly."} 14-day refund, cancel any time.</p>
      </div>
      <svg className="ehp-planorbits" viewBox="-280 -280 560 560" aria-hidden="true">
        <circle r="34" fill="currentColor" />
        {PLANS.map((p, i) => {
          const hot = i === on, a = -2.5 + i * 0.36, x = +(p.r * Math.cos(a)).toFixed(1), y = +(p.r * Math.sin(a)).toFixed(1);
          return (
            <g key={p.id} className="tier" onMouseEnter={() => setOn(i)}>
              <circle r={p.r} fill="none" stroke={hot ? "var(--ehp-mark)" : "currentColor"} strokeWidth={hot ? 1.6 : 0.7} strokeOpacity={hot ? 1 : 0.45} />
              <circle r={p.r} fill="none" stroke="transparent" strokeWidth="26" />
              <circle cx={x} cy={y} r="5" fill={hot ? "var(--ehp-mark)" : "currentColor"} />
              {hot && <text x={x - 14} y={y - 12} textAnchor="end" fill="var(--ehp-mark)">{p.name.toUpperCase()}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function EventHorizon({ signedIn, member, invited, discountPct, weekly, weekNo, dynasty, nextKickoff, posts }) {
  const stageRef = useRef(null);
  const bodies = useMemo(() => bodiesFor(member), [member]);
  const [size, setSize] = useState({ w: 1440, h: 900 });
  const [arrived, setArrived] = useState(false);
  const [header, setHeader] = useState("");
  const [seen, setSeen] = useState(false);

  // the stage's size (the sky is drawn in its pixels, so the hole and the ring always share one centre)
  useEffect(() => {
    const measure = () => {
      const el = stageRef.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, []);

  // arrive, then hand the disc's size to the scroll
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const a = setTimeout(() => setArrived(true), reduce ? 0 : 500);
    // a link to /#pricing (or any section) lands on it: the page is tall and its first screen is the fall
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "instant" }), 60);
    }
    return () => clearTimeout(a);
  }, []);

  // motion: orbits, the occasional speck, starlight drifting with the pointer, and the fall on scroll. Written straight to the
  // SVG / styles each frame (no React state per frame).
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = stageRef.current;
    if (!root) return undefined;
    const k = Math.max(0.45, Math.min(1, size.w / 1300));
    const R = radiusFor(size.w);
    const els = [...root.querySelectorAll(".ehp-body")];
    const stars = root.querySelector(".ehp-stars");
    const infall = root.querySelector(".ehp-infall");
    const hz = root.querySelector(".ehp-hz"), hole = root.querySelector(".ehp-hole"), skies = [...root.querySelectorAll(".ehp-sky")], cue = root.querySelector(".ehp-cue");
    const rnd = seeded(11);
    let tx = 0, ty = 0, px = 0, py = 0, speck = null, raf = 0, ready = false;
    // time for the orbits: it slows to a stop while a planet is hovered or focused, so it can be clicked without chasing it
    let T = 0, last = performance.now(), speed = 1, hovering = false;
    const hold = (v) => () => { hovering = v; };
    const holdOn = hold(true), holdOff = hold(false);
    els.forEach((o) => {
      o.addEventListener("pointerenter", holdOn);
      o.addEventListener("pointerleave", holdOff);
      o.addEventListener("focus", holdOn);
      o.addEventListener("blur", holdOff);
    });
    const onMove = (e) => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
    };
    const c = Math.cos(TILT), s = Math.sin(TILT);
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      speed += ((hovering ? 0 : 1) - speed) * Math.min(1, dt * 9); // ease to a stop and back
      T += dt * speed;
      els.forEach((o) => {
        const b = bodies[+o.dataset.i];
        const a = b.a + (reduce ? 0 : (T * 2 * Math.PI) / b.s);
        const x = b.rx * k * Math.cos(a), y = b.ry * k * Math.sin(a);
        o.setAttribute("transform", `translate(${(x * c - y * s).toFixed(1)} ${(x * s + y * c).toFixed(1)})`);
      });
      if (!reduce) {
        px += (tx - px) * 0.04;
        py += (ty - py) * 0.04;
        stars?.setAttribute("transform", `translate(${(-px * 18).toFixed(2)} ${(-py * 12).toFixed(2)})`);
        if (!speck || T - speck.t0 > 9) speck = { t0: T + 1, a0: rnd() * Math.PI * 2 };
        const p = (T - speck.t0) / 6.5;
        if (infall) {
          if (p >= 0 && p <= 1) {
            const r = Math.max(size.w, size.h) * 0.6 * (1 - p) + R * p, a = speck.a0 + p * 5;
            const op = Math.min(1, p * 6) * (1 - Math.pow(p, 6));
            infall.innerHTML = `<circle cx="${(r * Math.cos(a)).toFixed(1)}" cy="${(r * 0.55 * Math.sin(a)).toFixed(1)}" r="${(1.9 - p * 0.9).toFixed(2)}" fill="var(--ehp-mark)" opacity="${op.toFixed(2)}"/>`;
          } else infall.innerHTML = "";
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    function onScroll() {
      const fall = root.parentElement;
      const span = fall.offsetHeight - innerHeight;
      const p = Math.min(1, Math.max(0, (scrollY - fall.offsetTop) / span));
      const e = p * p * (3 - 2 * p);
      const need = (Math.hypot(size.w, size.h) / 2 / R) * 1.04;
      if (ready) {
        hz.style.transform = `scale(${1 + (need - 1) * e})`;
        hole.style.opacity = String(Math.max(0, 1 - p * 3.2));
        hole.style.pointerEvents = p > 0.2 ? "none" : "";
        cue.style.opacity = String(Math.max(0, 1 - p * 6));
      }
      skies.forEach((sk) => {
        sk.style.opacity = String(1 - Math.min(1, p * 1.6));
        sk.style.transform = `scale(${1 + e * 0.35})`;
      });
      const inside = document.getElementById("ehp-inside")?.getBoundingClientRect();
      setHeader(inside && inside.bottom <= 72 ? "docked" : p > 0.55 ? "in-hole" : "");
      if (inside && inside.top < innerHeight * 0.55) setSeen(true);
    }
    const ready_t = setTimeout(() => {
      ready = true;
      hz.style.transition = "none";
      onScroll();
    }, reduce ? 0 : 2000);
    addEventListener("pointermove", onMove);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(ready_t);
      removeEventListener("pointermove", onMove);
      removeEventListener("scroll", onScroll);
      els.forEach((o) => {
        o.removeEventListener("pointerenter", holdOn);
        o.removeEventListener("pointerleave", holdOff);
        o.removeEventListener("focus", holdOn);
        o.removeEventListener("blur", holdOff);
      });
    };
  }, [size, bodies]);

  return (
    <div className={`ehp${arrived ? " arrived" : ""}`} style={{ "--ehp-r": `${radiusFor(size.w)}px` }}>
      <header className={`ehp-header ${header}`}>
        <div className="ehp-wrap ehp-bar">
          <nav>
            <a href="#tools">Tools</a>
            <a href="#pricing">Plans</a>
            <a href="#feed">Letter</a>
          </nav>
          <Link className="ehp-brand" href="/">
            <span className="ehp-dock" aria-hidden="true" />
            Singularity Dynasty
          </Link>
          <div className="ehp-r">
            {signedIn ? (
              <>
                <Link href="/account">Account</Link>
                <Link className="ehp-in" href="/my-team">My Team</Link>
              </>
            ) : (
              <>
                <Link href="/login">Sign in</Link>
                <Link className="ehp-in" href="/login?next=/my-team">Fall in</Link>
              </>
            )}
            <ThemeToggle inline />
          </div>
        </div>
      </header>

      <section className="ehp-fall" id="hero">
        <div className="ehp-stage" ref={stageRef}>
          <Sky size={size} nextKickoff={nextKickoff} bodies={bodies} />
          <div className="ehp-hz" aria-hidden="true" />
          <div className="ehp-hole" id="main-content">
            <HoleLookup signedIn={signedIn} member={member} />
          </div>
          <Bodies size={size} bodies={bodies} />
          {invited && (
            <p className="ehp-invite" role="status">
              A friend invited you · {discountPct}% off your first payment is saved for you
            </p>
          )}
          <div className="ehp-cue" aria-hidden="true">
            <i />
            FALL IN
          </div>
        </div>
      </section>

      {/* 2 · the Game Board: a member's own week; a visitor a sample in the same structure, with the lineup alerts the board raises */}
      <section className={`ehp-inside${seen ? " seen" : ""}`} id="ehp-inside">
        <div className="ehp-wrap ehp-two">
          <div>
            <div className="ehp-k">{member?.rows?.length ? "The Game Board" : "The Game Board · a sample week"}</div>
            <h2 className="ehp-h">
              {member?.rows?.length ? <>Your week, <em>league by league.</em></> : <>Every league, <em>one screen.</em></>}
            </h2>
            <p className="ehp-lede">
              {member?.rows?.length
                ? "Every matchup you're in, the score so far (or what we expect before kickoff) and how likely you are to win it."
                : "Every matchup you're in, the score so far (or what we expect before kickoff) and how likely you are to win it, plus a heads-up when a starter in your lineup needs attention."}
            </p>
            <Link className="ehp-link" href="/my-team">Open the Game Board →</Link>
          </div>
          <div>
            <Matchups rows={member?.rows?.length ? member.rows : SAMPLE_ROWS} />
            {!member?.rows?.length && <Alerts items={SAMPLE_ALERTS} sample />}
          </div>
        </div>
      </section>

      {/* 3 · Weekly Projection Rankings */}
      <section className="ehp-weekly" id="weekly">
        <div className="ehp-wrap ehp-two">
          <div>
            <div className="ehp-k">Weekly Projection Rankings{weekNo ? ` · week ${weekNo}` : ""}</div>
            <h2 className="ehp-h">
              Not a guess. <em>A range.</em>
            </h2>
            <p className="ehp-lede">Nobody scores the same every week. For every player we show a bad week, a normal week and a great week, so you can see how high he can go and how low he can fall, and which matchups tilt it.</p>
            <Link className="ehp-link" href="/tools/redraft-rankings">See every player →</Link>
          </div>
          <table className="ehp-wk">
            <thead>
              <tr>
                <th className="l">Player</th>
                <th>Bad</th>
                <th>Normal</th>
                <th>Great</th>
                <th className="l">Range</th>
              </tr>
            </thead>
            <tbody>
              {(weekly || []).map((r) => (
                <tr key={r.name}>
                  <td className="l">
                    <span className="nm">{r.name}</span>
                    <span className="sub">{r.pos} · {r.team}{r.opp ? ` · ${r.opp}` : ""}</span>
                  </td>
                  <td className="fl">{fmt1(r.floor)}</td>
                  <td className="md">{fmt1(r.median)}</td>
                  <td className="ce">{fmt1(r.ceiling)}</td>
                  <td className="l"><MiniCurve floor={r.floor} median={r.median} ceiling={r.ceiling} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4 · Dynasty Draft Board */}
      <section className="ehp-dynasty ehp-dark" id="dynasty">
        <div className="ehp-wrap ehp-two">
          <div>
            <div className="ehp-k">Dynasty Draft Board</div>
            <h2 className="ehp-h">
              Who is <em>really ahead.</em>
            </h2>
            <p className="ehp-lede">Every player ranked on what he has produced and how many good years he has left, then grouped into tiers, so you can see who is genuinely a step above the next name on the list.</p>
            <Link className="ehp-link" href="/tools/draft-board">Open the board →</Link>
          </div>
          <ol className="ehp-dy">
            {(dynasty || []).map((r, i, all) => (
              <li key={r.name} className={all[i - 1] && all[i - 1].tier !== r.tier ? "new-tier" : ""}>
                <span className="no">{String(r.rank).padStart(2, "0")}</span>
                <span className="nm">
                  {r.name}
                  <span className="sub">{r.pos} · {r.team} · {r.age.toFixed(1)} yrs</span>
                </span>
                <span className="sc">{r.score.toFixed(1)}</span>
                <span className="tr">Tier {r.tier}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ehp-inst" id="tools">
        <div className="ehp-wrap">
          <div className="ehp-head">
            <div>
              <div className="ehp-k">Instruments</div>
              <h2 className="ehp-h">
                Five ways <em>to look.</em>
              </h2>
            </div>
            <div className="ehp-k">Updated every Tuesday</div>
          </div>
          <ol>
            {TOOLS.map(([h, p, t, href], i) => (
              <li key={h}>
                <Link href={href}>
                  <span className="no">{String(i + 1).padStart(2, "0")}</span>
                  <OrbitIcon rings={i + 1} />
                  <span className="name">{h}</span>
                  <span className="say">{p}</span>
                  <span className="t">{t}</span>
                  <span className="ar" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ehp-orbits" id="pricing">
        <Plans />
      </section>

      <section className="ehp-letter" id="feed">
        <div className="ehp-wrap ehp-two">
          <div>
            <div className="ehp-k">The Tuesday letter</div>
            <h2 className="ehp-h">
              What moved, <em>before waivers.</em>
            </h2>
            <p className="ehp-lede">Model notes, ranking shifts and rookie comparisons, once a week.</p>
          </div>
          <div>
            <NewsletterForm source="home" />
            {posts?.length > 0 && (
              <ul className="ehp-posts">
                {posts.map((p) => (
                  <li key={p.id}>
                    <a href={p.url}>
                      <span>{p.title}</span>
                      <em>{new Date(p.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</em>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
