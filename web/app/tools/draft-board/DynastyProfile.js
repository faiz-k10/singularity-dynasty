"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import { FORMATS, MODES, MOVE_MIN, ageValueOf, buildBoard, runwayOf } from "@/lib/dynastyBoard";
import { formatHeight } from "@/lib/format";
import { coachFor, acquiringGm } from "@/lib/teamStaff";
import { dynastyStory } from "@/lib/dynastyStory";
import DashboardShareButton from "../../DashboardShareButton";
import ArcGauge from "../../ArcGauge";

const ord = (n) => `#${n}`;

// What loads when a profile opens (his last games + bio), kept for the rest of the visit.
const cache = new Map();
function useProfileData(id) {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (cache.has(id)) return;
    const ctl = new AbortController();
    fetch(`/api/dynasty-profile?id=${encodeURIComponent(id)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { log: null, bio: null }))
      .then((d) => { cache.set(id, d); rerender((n) => n + 1); })
      .catch(() => {});
    return () => ctl.abort();
  }, [id]);
  return cache.get(id) || null;
}

// ---- charts: plain SVG, every colour a site token ------------------------------------------------------------------
// Each chart is drawn at its box's REAL width (1 svg unit = 1 css px), so text stays a readable size and the chart grows with the pane
// instead of shrinking a fixed 480-wide drawing (founder, Nov 16 2026: "plots and graphs as large as possible").
function useBoxWidth(initial = 420) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => { const v = Math.floor(el.getBoundingClientRect().width); if (v > 0) setW(v); };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// His last games as bars (green-mint above the replacement line, steel below), the line he is rated at, and replacement.
function Timeline({ log, level, repl, W }) {
  const H = Math.round(Math.min(320, Math.max(220, W * 0.6))), L = 30, R = 40, T = 12, B = 24; // R holds the two line values
  const pts = log.p, n = pts.length;
  const top = Math.max(30, Math.ceil(Math.max(...pts) / 10) * 10);
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const bw = (W - L - R) / n;
  const ticks = [];
  log.w.forEach((w, i) => { if (i === 0 || Math.floor(w / 100) !== Math.floor(log.w[i - 1] / 100)) ticks.push([i, `'${String(Math.floor(w / 100)).slice(2)}`]); });
  return (
    <svg className="dp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Points in each of his last ${n} games`}>
      {[0, top / 2, top].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="dp-grid" />
          <text x={L - 5} y={y(g) + 3} className="dp-axis" textAnchor="end">{Math.round(g)}</text>
        </g>
      ))}
      {pts.map((v, i) => (
        <rect key={i} x={L + i * bw + 1} y={y(v)} width={Math.max(1, bw - 2)} height={Math.max(0.5, y(0) - y(v))} className={v >= repl ? "dp-bar is-above" : "dp-bar"} />
      ))}
      {[[repl, "dp-line-repl"], [level, "dp-line-level"]].map(([v, c]) => (
        <g key={c}>
          <line x1={L} x2={W - R + 2} y1={y(v)} y2={y(v)} className="dp-line-halo" />
          <line x1={L} x2={W - R + 2} y1={y(v)} y2={y(v)} className={c} />
        </g>
      ))}
      {(() => { // the two values at the right end, pushed apart when they would touch
        let yl = y(level), yr = y(repl);
        if (Math.abs(yl - yr) < 14) { const mid = (yl + yr) / 2, up = yl <= yr ? -7 : 7; yl = mid + up; yr = mid - up; }
        return (<>
          <text x={W - R + 6} y={yl + 4} className="dp-label is-level">{level.toFixed(1)}</text>
          <text x={W - R + 6} y={yr + 4} className="dp-label is-repl">{repl.toFixed(1)}</text>
        </>);
      })()}
      {ticks.map(([i, t]) => <text key={t} x={L + i * bw} y={H - 7} className="dp-axis">{t}</text>)}
    </svg>
  );
}

// His position's age value by age (years until the age his position is typically done), him on it, his runway shaded.
function AgeCurve({ doneAge, pos, age, value, W }) {
  const H = Math.round(Math.min(320, Math.max(220, W * 0.6))), L = 44, R = 10, T = 14, B = 42; // room for the two axis titles
  const lo = 21, hi = 40, done = doneAge[pos];
  const x = (a) => L + ((a - lo) / (hi - lo)) * (W - L - R);
  const y = (v) => T + (1 - (v - 1) / 9) * (H - T - B);
  const a = Math.min(Math.max(age, lo), hi);
  const pts = [];
  for (let ag = lo; ag <= hi; ag += 0.5) pts.push(`${x(ag)},${y(ageValueOf(runwayOf(doneAge, pos, ag)))}`);
  return (
    <svg className="dp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Age value by age at his position">
      {[1, 5, 10].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="dp-grid" />
          <text x={L - 5} y={y(g) + 3} className="dp-axis" textAnchor="end">{g}</text>
        </g>
      ))}
      {done > a && <rect x={x(a)} y={T} width={x(Math.min(done, hi)) - x(a)} height={H - T - B} className="dp-band" />}
      <polyline className="dp-curve" points={pts.join(" ")} />
      <line x1={x(a)} x2={x(a)} y1={y(value)} y2={H - B} className="dp-drop" />
      <circle cx={x(a)} cy={y(value)} r="6" className="dp-dot" />
      <line x1={L} x2={L} y1={T} y2={H - B} className="dp-axis-line" />
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="dp-axis-line" />
      {[25, 30, 35, 40].map((t) => <text key={t} x={x(t)} y={H - B + 16} className="dp-axis" textAnchor={x(t) > W - R - 12 ? "end" : "middle"}>{t}</text>)}
      <text x={L + (W - L - R) / 2} y={H - 4} className="dp-axis-title" textAnchor="middle">Age</text>
      <text transform={`translate(12 ${T + (H - T - B) / 2}) rotate(-90)`} className="dp-axis-title" textAnchor="middle">Age value</text>
      {/* his age and value beside the point: above it, or below it when the point is at the top of the chart (a 10.0 was cut off) */}
      <text x={x(a) > W - 110 ? x(a) - 10 : x(a) + 10} y={y(value) - 10 < 14 ? y(value) + 22 : y(value) - 10} className="dp-label is-level" textAnchor={x(a) > W - 110 ? "end" : "start"}>{age.toFixed(1)} · {value.toFixed(1)}</text>
    </svg>
  );
}

// Every player's name is the SAME size (founder, Nov 16 2026): the largest size at which the longest name on the board still fits the
// pane on one line. Measured, not guessed: all names are laid out once at NAME_MAX in a hidden copy of the heading, the widest sets the
// size, then it shrinks until the widest really fits (text width doesn't scale exactly with font size). Re-run when the pane resizes
// and once the display font has loaded. The CSS size from --chars is only the first paint.
const NAME_MAX = 80;
function useFitName(names) {
  const ref = useRef(null);
  const key = names.join("|");
  useLayoutEffect(() => {
    const h = ref.current;
    if (!h) return undefined;
    const fit = () => {
      const room = h.clientWidth;
      if (!room || !names.length) return;
      const probe = document.createElement("div");
      probe.className = h.className;
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = `position:absolute; visibility:hidden; left:-99999px; top:0; width:auto; font-size:${NAME_MAX}px;`;
      for (const n of names) { const sp = document.createElement("span"); sp.textContent = n; sp.style.cssText = "display:block; width:max-content;"; probe.appendChild(sp); }
      h.parentNode.appendChild(probe);
      const widest = () => Math.max(...[...probe.children].map((c) => c.getBoundingClientRect().width));
      let size = Math.min(NAME_MAX, (NAME_MAX * room) / widest());
      for (let i = 0; i < 8; i++) {
        probe.style.fontSize = `${size.toFixed(1)}px`;
        const w = widest();
        if (w <= room) break;
        size *= (room / w) * 0.995;
      }
      probe.remove();
      h.style.fontSize = `${size.toFixed(1)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(h);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` stands for `names`
  return ref;
}

// One beat of the story: a tick on the spine, the beat's headline (a sentence from his numbers), the evidence, and the line
// that hands off to the next beat (lib/dynastyStory.js writes the words)
function Chapter({ says, close, children }) {
  return (
    <li className="dp-ch">
      <span className="dp-ch-n" aria-hidden="true" />
      <h3 className="dp-ch-says">{says}</h3>
      {children}
      {close && <p className="dp-next">{close}</p>}
    </li>
  );
}

// A fact that changed over his last nine games: the new value coloured, then a small arrow and the old value in grey (lower is better
// for all three: ranks and tiers). Renders the plain value when nothing changed.
function Fact({ label, now, was, show = (v) => v, suffix = null }) {
  const moved = was != null && was !== now;
  const up = moved && was > now;
  return (
    <div>
      <dt className="mono">{label}</dt>
      <dd className={moved ? (up ? "is-up" : "is-down") : undefined}>
        <span className="dp-now">{show(now)}</span>
        {suffix}
        {moved && (
          <span className="dp-chg" aria-label={`${up ? "up" : "down"} from ${show(was)} nine games ago`}>
            <svg viewBox="0 0 8 10" aria-hidden="true"><path d={up ? "M4 9.5V1.5M1 4.5L4 1.5L7 4.5" : "M4 .5V8.5M1 5.5L4 8.5L7 5.5"} /></svg>
            {show(was)}
          </span>
        )}
      </dd>
    </div>
  );
}

// ---- the panel -----------------------------------------------------------------------------------------------------
// The picked player's profile, in the pane beside the board's list (DynastyBoard.js).
export default function DynastyProfile({ player: p, rows, L, board, format, mode, meta }) {
  const data = useProfileData(p.id);
  const allNames = useMemo(() => rows.map((r) => r.name), [rows]); // every player shipped to this viewer, not just this view
  const nameRef = useFitName(allNames);
  const [chartRef, chartW] = useBoxWidth(); // the sections' width: the charts and the dial take all of it
  const f = FORMATS[format], m = MODES[mode];

  const i = L.findIndex((r) => r.id === p.id);
  const tier = board.tiers.find((t) => i >= t.a && i <= t.b);
  const group = board.groups[tier.g];

  // his rank in every format and mode, worked out on the server over the whole board (rankGrid)
  const grid = p.ranks ? Object.entries(p.ranks).map(([k, c]) => { const [fk, mk] = k.split(":"); return { fk, mk, ...c }; }) : null;
  const here = grid?.find((c) => c.fk === format && c.mk === mode);

  const repl = (m.short ? meta.replacementShort : meta.replacement)[format.toUpperCase()][p.pos];
  const win = m.short ? meta.windowShort : meta.window;
  // his tier, him included (founder, Nov 16 2026: only players the board can't separate from him), at most the 5 nearest by rank
  // the "who is he level with" beat reads his statistical TIE (the bracket on the board: too close to call), not his whole tier
  // (founder, Nov 21 2026); at most the 5 players nearest him in it
  const tie = board.ties.find((z) => i >= z.a && i <= z.b && z.b > z.a) || { a: i, b: i };
  const MATES = 5;
  const start = Math.max(tie.a, Math.min(i - Math.floor(MATES / 2), tie.b + 1 - MATES));
  const tierMates = L.slice(start, Math.min(tie.b + 1, start + MATES));
  const tierSize = tie.b - tie.a + 1, tierPlace = i - tie.a + 1;
  const log = data?.log ? { w: data.log.w.slice(-win.games), p: data.log.p.slice(-win.games) } : null;
  const above = log ? log.p.filter((v) => v >= repl).length : 0;
  const coach = coachFor(p.team), staff = acquiringGm(p);
  const gmLine = (() => {
    const d = staff;
    if (p.team === "FA") return "None: he's a free agent";
    if (d.state === "undrafted") return "Undrafted";
    if (d.state !== "yes" && d.state !== "no") return "Not known";
    // a roster-based arrival in week 1 is dated March 15 (model/dynasty_value.R): say "before the season", not a month
    const when = d.how === "drafted" ? `in the ${d.at} draft` : d.how === "joined" && d.at.endsWith("-03-15") ? `before the ${d.at.slice(0, 4)} season` : `in ${new Date(`${d.at}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
    const how = d.how === "drafted" ? `Drafted by ${p.team}` : d.how === "trade" ? `Traded to ${p.team} (drafted by ${d.from})` : `Joined ${p.team} (drafted by ${d.from})`;
    return d.state === "yes" ? `${how} ${when}, under ${d.gm}, who still runs the team` : `${how} ${when}, before ${d.gm} took over`;
  })();
  // which way his score has gone over his last nine games: cobalt up, ember down, grey when it moved less than MOVE_MIN
  const dir = p.move == null || Math.abs(p.move) < MOVE_MIN ? "steady" : p.move > 0 ? "up" : "down";
  // his tier nine games ago: this same list with every score taken back by its move, tiered again
  const prevTier = useMemo(() => {
    if (p.move == null) return null;
    const back = L.map((r) => ({ ...r, score: r.score - (r.move ?? 0) })).sort((a, b) => b.score - a.score);
    const at = back.findIndex((r) => r.id === p.id);
    const t = buildBoard(back).tiers.findIndex((x) => at >= x.a && at <= x.b);
    return t < 0 ? null : t + 1;
  }, [L, p.id, p.move]);
  const story = dynastyStory(p, {
    rank: i + 1, prev: p.prevRank, scope: L.every((r) => r.pos === p.pos) && L.length < rows.length ? `among ${p.pos}s` : "on the board",
    overall: here?.rank, posRank: here?.posRank, next: L[i + 1]?.name, gapBelow: L[i + 1] ? p.score - L[i + 1].score : 0,
    group: group.name, tierSize, tierPlace,
    mates: L.slice(tie.a, tie.b + 1).filter((r) => r.id !== p.id).sort((a, b) => Math.abs(L.indexOf(a) - i) - Math.abs(L.indexOf(b) - i)).map((r) => r.name),
    repl, above, games: log?.p.length || 0, doneAge: meta.doneAge[p.pos], rebuild: !!m.window,
    viewLabel: `${f.label} ${m.label}`,
    views: grid?.map((c) => ({ label: `${FORMATS[c.fk].label} ${MODES[c.mk].label}`, rank: c.rank })),
    coach,
  });
  const size = [formatHeight(data?.bio?.height), data?.bio?.weight ? `${data.bio.weight} lbs` : null, data?.bio?.yearsExp != null ? (data.bio.yearsExp === 0 ? "Rookie" : `Year ${data.bio.yearsExp + 1}`) : null].filter(Boolean);

  return (
      <aside className="dp" aria-label={`${p.name}, dynasty profile`}>

        {/* the name gets the pane's whole width, on one line: its size comes from its length (--chars) and the pane's width */}
        <h2 className="dp-name" ref={nameRef} style={{ "--chars": p.name.length }}>{p.name}</h2>
        <header className="dp-head">
          <div className="dp-photo">{data?.bio?.headshot ? <img src={data.bio.headshot} alt="" width="64" height="64" /> : <span>{p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>}</div>
          <div className="dp-id">
            <div className="dp-badges">
              <PositionBadge position={p.pos} />
              <TeamBadge team={p.team} />
              {/* Share sits beside the team logo, under the name (founder, Nov 17 2026) */}
              <DashboardShareButton
                target=".dp"
                blocks=".dp > .dp-name, .dp > .dp-head, .dp-story > li"
                title={`${p.name}: dynasty ${p.score.toFixed(1)}`}
                heading={`Dynasty Board · ${f.label} · ${m.label}`}
                caption={`${p.name} in dynasty: ${p.score.toFixed(1)} (${f.label}, ${m.label}).`}
                file={`dynasty-singularity-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className="lab-copy dp-share-btn"
              />
            </div>
            <div className="dp-demo mono">{[`${p.age.toFixed(1)} yrs`, ...size].join(" · ")}</div>
            <div className="dp-links">
              <Link href="/tools/player-simulations">Player Season Simulations →</Link>
              <Link href="/tools/redraft-rankings">Weekly rankings →</Link>
            </div>
          </div>
        </header>

        {/* The profile reads as ONE story down a spine (founder, Nov 16 2026: "tell a story based on what is already there"):
            what he's worth, where that comes from, how long it lasts, who he's level with, whether the league changes it, and
            who is around him. Each chapter's title is a sentence made from his own numbers. */}
        <div className="dp-lede">
          <p>{story.lede}</p>
        </div>
        <ol className="dp-story">
          <Chapter says={story.worth.head} close={story.worth.close}>
            <div className={`dp-score is-${dir}`} ref={chartRef}>
              {/* the dial takes the block's whole width; the number grows with it */}
              <ArcGauge value={p.score / 10} from={dir === "steady" ? null : (p.score - p.move) / 10} size={Math.max(200, chartW - 34)} label={`Dynasty score ${p.score.toFixed(1)} of 10`} className="dp-gauge">
                <span className="dp-big" style={{ fontSize: Math.round(Math.max(200, chartW - 34) * 0.24) }}>{p.score.toFixed(1)}</span>
              </ArcGauge>
              <div className="dp-score-side">
                <div className="dp-eyebrow mono">Dynasty score · {f.label} · {m.label}</div>
                <dl className="dp-facts">
                  {here && <Fact label="Overall" now={here.rank} was={here.prev} show={ord} />}
                  {here && <Fact label="Position" now={here.posRank} was={here.prevPos} show={(v) => `${p.pos}${v}`} />}
                  <Fact label="Tier" now={tier.ti + 1} was={prevTier} show={(v) => `T${v}`} suffix={<small> / T{board.tiers.length}</small>} />
                  <div><dt className="mono">Group</dt><dd>{group.name}</dd></div>
                </dl>
              </div>
            </div>
          </Chapter>

          <Chapter says={story.prod.head} close={log ? story.prod.close : null}>
            {log ? (
              <>
                <Timeline log={log} level={p.ppg} repl={repl} W={chartW} />
                <ul className="dp-legend mono">
                  <li><i className="k-level" />His level {p.ppg.toFixed(1)}</li>
                  <li><i className="k-repl" />Replacement {p.pos} {repl.toFixed(1)}</li>
                  <li><i className="k-above" />Game above replacement</li>
                  <li><i className="k-below" />Below</li>
                </ul>
              </>
            ) : <div className="dp-chart-skel">{data ? "No game log yet." : "Loading his games…"}</div>}
          </Chapter>

          <Chapter says={story.age.head} close={story.age.close}>
            <AgeCurve doneAge={meta.doneAge} pos={p.pos} age={p.age} value={p.ageValue} W={chartW} />
          </Chapter>

          {/* his place inside his tier: the table shows the players nearest him, the bridge says how wide the tier is */}
          <Chapter says={story.tier.head} close={story.tier.close}>
            {tierMates.length > 1 && (
              <table className="dp-table">
                <tbody>
                  {tierMates.map((r) => (
                    <tr key={r.id} className={r.id === p.id ? "is-him" : undefined}>
                      <td className="mono dp-t-rank">{L.indexOf(r) + 1}</td>
                      <td className="dp-t-name">{r.name}</td>
                      <td className="mono dp-t-p">{r.score.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
</Chapter>

          {grid && (
            <Chapter says={story.league.head} close={story.league.close}>
              {/* the four views as a matrix: league format down the side, team mode across the top; this view's cell lit */}
              <table className="dp-matrix">
                <thead>
                  <tr>
                    <th aria-hidden="true" />
                    {Object.keys(MODES).map((mk) => <th key={mk} scope="col" className="mono">{MODES[mk].label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(FORMATS).map((fk) => (
                    <tr key={fk}>
                      <th scope="row" className="mono">{FORMATS[fk].label}</th>
                      {Object.keys(MODES).map((mk) => {
                        const c = grid.find((g) => g.fk === fk && g.mk === mk);
                        return (
                          <td key={mk} className={fk === format && mk === mode ? "is-here" : undefined}>
                            <b>{ord(c.rank)}</b>
                            <span className="mono">{p.pos}{c.posRank} · {c.score.toFixed(1)}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Chapter>
          )}

          <Chapter says={story.staff.head}>
            <dl className="dp-ctx">
              <div>
                <dt className="mono">GM who brought him in</dt>
                <dd>{gmLine}</dd>
              </div>
            </dl>
          </Chapter>
        </ol>
      </aside>
  );
}
