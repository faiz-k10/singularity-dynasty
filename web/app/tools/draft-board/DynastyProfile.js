"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import { FORMATS, MODES, MOVE_MIN, ageValueOf, runwayOf } from "@/lib/dynastyBoard";
import { formatHeight, ordinal } from "@/lib/format";
import { coachFor, acquiringGm } from "@/lib/teamStaff";
import ShareCardButton from "../../ShareCardButton";
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
      <text x={x(a) > W - 110 ? x(a) - 10 : x(a) + 10} y={y(value) - 10} className="dp-label is-level" textAnchor={x(a) > W - 110 ? "end" : "start"}>{age.toFixed(1)} · {value.toFixed(1)}</text>
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

// How his score has moved over his last driftGames games (production alone, age held): up, down or steady (under MOVE_MIN).
function moveLine(p) {
  const n = p.driftGames || 9;
  if (p.move == null) return `Not enough games yet to say how his score has moved over his last ${n}.`;
  const d = Math.abs(p.move).toFixed(1);
  if (Math.abs(p.move) < MOVE_MIN) return `Steady: his score has moved only ${d} over his last ${n} games.`;
  return p.move > 0 ? `Rising: his score is up ${d} over his last ${n} games.` : `Falling: his score is down ${d} over his last ${n} games.`;
}

// One step of the story: a numbered node on the spine, the question it answers, the answer from his numbers, then the evidence.
function Chapter({ n, ask, says, children }) {
  return (
    <li className="dp-ch">
      <span className="dp-ch-n mono" aria-hidden="true">{String(n).padStart(2, "0")}</span>
      <div className="dp-ch-ask mono">{ask}</div>
      <h3 className="dp-ch-says">{says}</h3>
      {children}
    </li>
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
  const MATES = 5;
  const start = Math.max(tier.a, Math.min(i - Math.floor(MATES / 2), tier.b + 1 - MATES));
  const tierMates = L.slice(start, Math.min(tier.b + 1, start + MATES));
  const tierSize = tier.b - tier.a + 1, tierPlace = i - tier.a + 1;
  const log = data?.log ? { w: data.log.w.slice(-win.games), p: data.log.p.slice(-win.games) } : null;
  const above = log ? log.p.filter((v) => v >= repl).length : 0;
  const rankLo = grid ? Math.min(...grid.map((c) => c.rank)) : null, rankHi = grid ? Math.max(...grid.map((c) => c.rank)) : null;
  const coach = coachFor(p.team), staff = acquiringGm(p);
  const gmLine = (() => {
    const d = staff;
    if (d.state === "undrafted") return "Undrafted";
    if (d.state !== "yes" && d.state !== "no") return "Not known";
    // a roster-based arrival in week 1 is dated March 15 (model/dynasty_value.R): say "before the season", not a month
    const when = d.how === "drafted" ? `in the ${d.at} draft` : d.how === "joined" && d.at.endsWith("-03-15") ? `before the ${d.at.slice(0, 4)} season` : `in ${new Date(`${d.at}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
    const how = d.how === "drafted" ? `Drafted by ${p.team}` : d.how === "trade" ? `Traded to ${p.team} (drafted by ${d.from})` : `Joined ${p.team} (drafted by ${d.from})`;
    return d.state === "yes" ? `${how} ${when}, under ${d.gm}, who still runs the team` : `${how} ${when}, before ${d.gm} took over`;
  })();
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
            </div>
            <div className="dp-demo mono">{[`${p.age.toFixed(1)} yrs`, ...size].join(" · ")}</div>
            <div className="dp-links">
              <Link href={`/tools/lab?p=${encodeURIComponent(p.name)}`}>The Observatory →</Link>
              <Link href="/tools/redraft-rankings">Weekly rankings →</Link>
            </div>
          </div>
        </header>
        <div className="dp-share">
          <ShareCardButton
            card={{ kind: "d", id: p.id, f: format, m: mode }}
            caption={`${p.name} in dynasty: ${p.score.toFixed(1)} (${f.label}, ${m.label}).`}
            file={`dynasty-singularity-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            label="Share card"
          />
        </div>

        {/* The profile reads as ONE story down a spine (founder, Nov 16 2026: "tell a story based on what is already there"):
            what he's worth, where that comes from, how long it lasts, who he's level with, whether the league changes it, and
            who is around him. Each chapter's title is a sentence made from his own numbers. */}
        <ol className="dp-story">
          <Chapter n={1} ask="What is he worth?" says={here ? `${p.pos}${here.posRank} and #${here.rank} overall: ${group.name}` : `${group.name}, tier ${tier.ti + 1}`}>
            <div className="dp-score" ref={chartRef}>
              {/* the dial takes the block's whole width; the number grows with it */}
              <ArcGauge value={p.score / 10} size={Math.max(200, chartW - 34)} label={`Dynasty score ${p.score.toFixed(1)} of 10`} className="dp-gauge">
                <span className="dp-big" style={{ fontSize: Math.round(Math.max(200, chartW - 34) * 0.24) }}>{p.score.toFixed(1)}</span>
              </ArcGauge>
              <div className="dp-score-side">
                <div className="dp-eyebrow mono">Dynasty score · {f.label} · {m.label}</div>
                <dl className="dp-facts">
                  {here && <div><dt className="mono">Overall</dt><dd>{ord(here.rank)}</dd></div>}
                  {here && <div><dt className="mono">Position</dt><dd>{p.pos}{here.posRank}</dd></div>}
                  <div><dt className="mono">Tier</dt><dd>{tier.ti + 1}<small> / {board.tiers.length}</small></dd></div>
                  <div><dt className="mono">Group</dt><dd>{group.name}</dd></div>
                </dl>
              </div>
            </div>
            <p className="dp-next">{moveLine(p)}</p>
          </Chapter>

          <Chapter n={2} ask="Where does it come from?" says={`${p.ppg.toFixed(1)} points a game, ${Math.abs(p.ppg - repl).toFixed(1)} ${p.ppg >= repl ? "more" : "fewer"} than a replacement ${p.pos}`}>
            {log ? (
              <>
                <Timeline log={log} level={p.ppg} repl={repl} W={chartW} />
                <ul className="dp-legend mono">
                  <li><i className="k-level" />His level {p.ppg.toFixed(1)}</li>
                  <li><i className="k-repl" />Replacement {p.pos} {repl.toFixed(1)}</li>
                  <li><i className="k-above" />Game above replacement</li>
                  <li><i className="k-below" />Below</li>
                </ul>
                <p className="dp-next">Above replacement in {above} of his last {log.p.length} games.</p>
              </>
            ) : <div className="dp-chart-skel">{data ? "No game log yet." : "Loading his games…"}</div>}
          </Chapter>

          <Chapter n={3} ask="How long will it last?" says={p.runway > 0 ? `About ${p.runway.toFixed(1)} years until ${p.pos}s are typically done, at ${meta.doneAge[p.pos]}` : `Past the age ${p.pos}s are typically done (${meta.doneAge[p.pos]})`}>
            <AgeCurve doneAge={meta.doneAge} pos={p.pos} age={p.age} value={p.ageValue} W={chartW} />
            <p className="dp-next">An age value of {p.ageValue.toFixed(1)} of 10{m.window && p.runway < m.window ? `, and a rebuilder counts only ${Math.round((p.runway / m.window) * 100)}% of his production: it runs out before the rebuild is done` : ""}.</p>
          </Chapter>

          {/* his place inside his tier: the table shows the players nearest him, the bridge says how wide the tier is */}
          <Chapter n={4} ask="Who is he level with?" says={tierSize > 1 ? `${ordinal(tierPlace)} of ${tierSize} in tier ${tier.ti + 1}, too close to call against any of them` : `Alone in tier ${tier.ti + 1}: nobody is close enough to call even`}>
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
            {tierSize > 1 && (
              <p className="dp-next">
                {tierSize > tierMates.length ? `The ${tierMates.length} nearest him. ` : ""}Tier {tier.ti + 1} runs from {L[tier.a].score.toFixed(1)} down to {L[tier.b].score.toFixed(1)}, close enough that any of them could turn out the better pick.
              </p>
            )}
          </Chapter>

          {grid && (
            <Chapter n={5} ask="Does the league change it?" says={rankLo === rankHi ? `No: #${rankLo} in every format and mode` : `From #${rankLo} to #${rankHi}, depending on the league`}>
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

          <Chapter n={grid ? 6 : 5} ask="Who is around him?" says={`${p.team}: ${coach ? coach.hc : "coach unknown"}${staff.gm ? ` and ${staff.gm}` : ""}`}>
            <dl className="dp-ctx">
              <div>
                <dt className="mono">Head coach</dt>
                <dd>{coach ? <>{coach.hc}: {coach.oc ? "a former offensive coordinator" : "never an offensive coordinator"}</> : "Unknown"}</dd>
              </div>
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
