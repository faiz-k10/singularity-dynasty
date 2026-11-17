"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import { AGE_LOOKAHEAD, FORMATS, GROUP_NAMES, MODES, profileRead, scoreRows } from "@/lib/dynastyBoard";
import { formatHeight } from "@/lib/format";
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

// His last games as bars (green-mint above the replacement line, steel below), the line he is rated at, and replacement.
function Timeline({ log, level, repl }) {
  const W = 480, H = 150, L = 30, R = 8, T = 10, B = 22;
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
      <line x1={L} x2={W - R} y1={y(repl)} y2={y(repl)} className="dp-line-repl" />
      <line x1={L} x2={W - R} y1={y(level)} y2={y(level)} className="dp-line-level" />
      <text x={W - R} y={y(level) - 4} className="dp-label is-level" textAnchor="end">his level {level.toFixed(1)}</text>
      <text x={W - R} y={y(repl) + 11} className="dp-label is-repl" textAnchor="end">replacement {repl.toFixed(1)}</text>
      {ticks.map(([i, t]) => <text key={t} x={L + i * bw} y={H - 6} className="dp-axis">{t}</text>)}
    </svg>
  );
}

// His position's age value by age, him on it, and the three seasons a buyer is paying for shaded.
function AgeCurve({ curve, age, value }) { // age = his age now; the dot sits on the age he will be in AGE_LOOKAHEAD years
  const W = 480, H = 130, L = 26, R = 8, T = 10, B = 22;
  const lo = curve[0][0], hi = curve.at(-1)[0];
  const x = (a) => L + ((a - lo) / (hi - lo)) * (W - L - R);
  const y = (v) => T + (1 - (v - 1) / 9) * (H - T - B);
  const a = Math.min(Math.max(age, lo), hi);
  const b = Math.min(a + AGE_LOOKAHEAD, hi);
  return (
    <svg className="dp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Age value by age at his position">
      {[1, 5, 10].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="dp-grid" />
          <text x={L - 5} y={y(g) + 3} className="dp-axis" textAnchor="end">{g}</text>
        </g>
      ))}
      <rect x={x(a)} y={T} width={Math.max(0, x(b) - x(a))} height={H - T - B} className="dp-band" />
      <polyline className="dp-curve" points={curve.map(([ag, v]) => `${x(ag)},${y(v)}`).join(" ")} />
      <line x1={x(b)} x2={x(b)} y1={y(value)} y2={H - B} className="dp-drop" />
      <circle cx={x(b)} cy={y(value)} r="4.6" className="dp-dot" />
      {[25, 30, 35, 40].filter((t) => t >= lo && t <= hi).map((t) => <text key={t} x={x(t)} y={H - 6} className="dp-axis" textAnchor="middle">{t}</text>)}
      <text x={Math.min(x(b) + 8, W - R - 4)} y={y(value) - 8} className="dp-label is-level" textAnchor={x(b) > W - 90 ? "end" : "start"}>{(age + AGE_LOOKAHEAD).toFixed(1)} · {value.toFixed(1)}</text>
    </svg>
  );
}

// The name fills the pane's width on one line: measured, not guessed (the CSS size from --chars is the first paint and the fallback).
// Re-measured when the pane resizes and once the display font has loaded.
const NAME_MAX = 80; // high enough that short names (Josh Allen) still span the pane
function useFitName(name) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const h = ref.current;
    if (!h) return undefined;
    // text width does not scale exactly with font size (hinting, rounding), so: size from one measurement, then shrink until it fits
    const width = () => { const r = document.createRange(); r.selectNodeContents(h); return r.getBoundingClientRect().width; };
    const fit = () => {
      const room = h.clientWidth;
      if (!room) return;
      h.style.fontSize = `${NAME_MAX}px`;
      let size = Math.min(NAME_MAX, (NAME_MAX * room) / width());
      for (let i = 0; i < 8; i++) {
        h.style.fontSize = `${size.toFixed(1)}px`;
        const w = width();
        if (w <= room) break;
        size *= (room / w) * 0.995;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(h);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [name]);
  return ref;
}

// ---- the panel -----------------------------------------------------------------------------------------------------
// The picked player's profile, in the pane beside the board's list (DynastyBoard.js).
export default function DynastyProfile({ player: p, rows, L, board, format, mode, meta, complete }) {
  const data = useProfileData(p.id);
  const nameRef = useFitName(p.name);
  const f = FORMATS[format], m = MODES[mode];

  const i = L.findIndex((r) => r.id === p.id);
  const tier = board.tiers.find((t) => i >= t.a && i <= t.b);
  const group = board.groups[tier.g];
  const tie = board.ties.find((t) => i >= t.a && i <= t.b);
  const tied = L.slice(tie.a, tie.b + 1).filter((r) => r.id !== p.id);

  // rank over the whole shipped pool, in every format and mode (only honest when the pool is the whole board)
  const grid = useMemo(() => {
    if (!complete) return null;
    return Object.keys(FORMATS).flatMap((fk) => Object.keys(MODES).map((mk) => {
      const S = scoreRows(rows, fk, mk), at = S.findIndex((r) => r.id === p.id);
      return { fk, mk, rank: at + 1, score: S[at].score, posRank: S.filter((r) => r.pos === p.pos).findIndex((r) => r.id === p.id) + 1 };
    }));
  }, [complete, rows, p.id, p.pos]);
  const here = grid?.find((c) => c.fk === format && c.mk === mode);

  const repl = (m.short ? meta.replacementShort : meta.replacement)[format.toUpperCase()][p.pos];
  const win = m.short ? meta.windowShort : meta.window;
  const curve = meta.ageCurve[p.pos];
  const keptAge = p.age + AGE_LOOKAHEAD;
  const kept = (() => { const c = curve.reduce((b, r) => (Math.abs(r[0] - keptAge) < Math.abs(b[0] - keptAge) ? r : b), curve[0]); return c[2]; })();
  const neighbours = [...L.slice(Math.max(0, i - 3), i), ...L.slice(i + 1, i + 4)];
  const size = [formatHeight(data?.bio?.height), data?.bio?.weight ? `${data.bio.weight} lbs` : null, data?.bio?.yearsExp != null ? (data.bio.yearsExp === 0 ? "Rookie" : `Year ${data.bio.yearsExp + 1}`) : null].filter(Boolean);
  const prodC = m.prod * p.prod, ageC = m.age * p.ageValue;
  const read = profileRead({ p, mode, repl, tied, ranks: grid?.map((c) => c.rank) });

  return (
      <aside className="dp" aria-label={`${p.name}, dynasty profile`}>

        {/* the name gets the pane's whole width, on one line: its size comes from its length (--chars) and the pane's width */}
        <h2 className="dp-name" ref={nameRef} style={{ "--chars": p.name.length }}>{p.name}</h2>
        <div className="dp-top">{/* who he is and what he scores: the first column when the profile sits under the board */}
        <header className="dp-head">
          <div className="dp-photo">{data?.bio?.headshot ? <img src={data.bio.headshot} alt="" width="76" height="76" /> : <span>{p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>}</div>
          <div className="dp-id">
            <div className="dp-badges">
              <PositionBadge position={p.pos} />
              <TeamBadge team={p.team} />
              <span className="mono">{[`${p.age.toFixed(1)} yrs`, ...size].join(" · ")}</span>
            </div>
            <div className="dp-links">
              <Link href={`/tools/lab?p=${encodeURIComponent(p.name)}`}>The Observatory →</Link>
              <Link href="/tools/redraft-rankings">Weekly rankings →</Link>
              <ShareCardButton
                card={{ kind: "d", id: p.id, f: format, m: mode }}
                caption={`${p.name} in dynasty: ${p.score.toFixed(1)} (${f.label}, ${m.label}).`}
                file={`dynasty-singularity-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                label="Share card"
              />
            </div>
          </div>
        </header>

        <section className="dp-score">
          <ArcGauge value={p.score / 10} size={150} label={`Dynasty score ${p.score.toFixed(1)} of 10`} className="dp-gauge">
            <span className="dp-big">{p.score.toFixed(1)}</span>
          </ArcGauge>
          <div className="dp-score-side">
            <div className="dp-eyebrow mono">Dynasty score · {f.label} · {m.label}</div>
            <dl className="dp-facts">
              {here && <div><dt className="mono">Overall</dt><dd>{ord(here.rank)}</dd></div>}
              {here && <div><dt className="mono">Position</dt><dd>{p.pos}{here.posRank}</dd></div>}
              <div><dt className="mono">Tier</dt><dd>{tier.ti + 1}<small> / {board.tiers.length}</small></dd></div>
              <div><dt className="mono">Group</dt><dd>{GROUP_NAMES[group.g] || "Deep"}</dd></div>
            </dl>
            <div className="dp-range mono">80% range {p.lo.toFixed(1)}–{p.hi.toFixed(1)}</div>
          </div>
        </section>

        <p className="dp-read">{read}</p>

        {(() => {
          const c = coachFor(p.team), d = acquiringGm(p);
          return (
            <dl className="dp-ctx">
              <div>
                <dt className="mono">Head coach</dt>
                <dd>{c ? <>{c.hc}: {c.oc ? "a former offensive coordinator" : "never an offensive coordinator"}</> : "Unknown"}</dd>
              </div>
              <div>
                <dt className="mono">GM who brought him in</dt>
                <dd>
                  {(() => {
                    // a roster-based arrival in week 1 is dated March 15 (model/dynasty_value.R): say "before the season", not a month
                    const when = d.how === "drafted" ? `in the ${d.at} draft` : d.how === "joined" && d.at.endsWith("-03-15") ? `before the ${d.at.slice(0, 4)} season` : `in ${new Date(`${d.at}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
                    const how = d.how === "drafted" ? `Drafted by ${p.team}` : d.how === "trade" ? `Traded to ${p.team} (drafted by ${d.from})` : `Joined ${p.team} (drafted by ${d.from})`;
                    if (d.state === "yes") return `${how} ${when}, under ${d.gm}, who still runs the team`;
                    if (d.state === "no") return `${how} ${when}, before ${d.gm} took over`;
                    return d.state === "undrafted" ? "Undrafted" : "Not known";
                  })()}
                </dd>
              </div>
            </dl>
          );
        })()}
        </div>

        <section className="dp-sec">
          <h3 className="board-panel-title">The recipe</h3>
          <div className="dp-recipe">
            <div className="dp-r-row">
              <span className="dp-r-name">Production over replacement</span>
              <span className="dp-r-val mono">{p.prod.toFixed(1)}</span>
              <span className="dp-r-w mono">× {Math.round(m.prod * 100)}%</span>
              <span className="dp-r-eq mono">{prodC.toFixed(1)}</span>
            </div>
            <div className="dp-r-sub mono">{p.ppg.toFixed(1)} PPG over his last {win.games} games, replacement {p.pos} {repl.toFixed(1)} → {(p.ppg - repl >= 0 ? "+" : "") + (p.ppg - repl).toFixed(1)} a game</div>
            <div className="dp-r-row">
              <span className="dp-r-name">Age</span>
              <span className="dp-r-val mono">{p.ageValue.toFixed(1)}</span>
              <span className="dp-r-w mono">× {Math.round(m.age * 100)}%</span>
              <span className="dp-r-eq mono">{ageC.toFixed(1)}</span>
            </div>
            <div className="dp-r-sub mono">{p.pos}s of the age he will be in {AGE_LOOKAHEAD} years ({keptAge.toFixed(1)}) keep about {Math.round(kept * 100)}% of their production over the three seasons after that</div>
            <div className="dp-r-row">
              <span className="dp-r-name">Relative to the board</span>
              <span className="dp-r-val mono">{p.raw.toFixed(1)}</span>
              <span className="dp-r-w mono">× {p.scale.toFixed(2)}</span>
              <span className="dp-r-eq mono">{p.score.toFixed(1)}</span>
            </div>
            <div className="dp-r-sub mono">every score is multiplied by the same number so the best player on the board reads 10.0</div>
            <div className="dp-stack" role="img" aria-label="Production and age shares of the score">
              <span className="dp-stack-prod" style={{ width: `${Math.max(0, prodC * p.scale) * 10}%` }} />
              <span className="dp-stack-age" style={{ width: `${Math.max(0, ageC * p.scale) * 10}%` }} />
            </div>
            <div className="dp-r-row is-total"><span className="dp-r-name">Dynasty score</span><span className="dp-r-eq mono">{p.score.toFixed(1)}</span></div>
          </div>
        </section>

        <section className="dp-sec">
          <h3 className="board-panel-title">Production, game by game</h3>
          {data?.log ? <Timeline log={{ w: data.log.w.slice(-win.games), p: data.log.p.slice(-win.games) }} level={p.ppg} repl={repl} /> : <div className="dp-chart-skel">{data ? "No game log yet." : "Loading his games…"}</div>}
          <p className="dp-cap">Each bar is a game. His level is weighted toward the newest, with a half-life of {win.half_life} games.</p>
        </section>

        <section className="dp-sec">
          <h3 className="board-panel-title">His age curve</h3>
          <AgeCurve curve={curve} age={p.age} value={p.ageValue} />
          <p className="dp-cap">Age value for {p.pos}s from 2008–25: how much production players of that age kept over the next three seasons, counting those who dropped out. He is scored on his age three years from now (the dot); the shaded band is the years in between.</p>
        </section>

        <section className="dp-sec">
          <h3 className="board-panel-title">Closest on the board</h3>
          {tied.length > 0 && <p className="dp-tied">Tied with {tied.map((r) => r.name).join(", ")}: the order inside the box is close to a coin flip.</p>}
          <table className="dp-table">
            <tbody>
              {neighbours.map((r) => {
                return (
                  <tr key={r.id}>
                    <td className="mono dp-t-rank">{L.indexOf(r) + 1}</td>
                    <td className="dp-t-name">{r.name}</td>
                    <td className="mono dp-t-p">{r.score.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {grid && (
          <section className="dp-sec">
            <h3 className="board-panel-title">How his rank moves</h3>
            <div className="dp-grid4">
              {grid.map((c) => (
                <div key={`${c.fk}${c.mk}`} className={`dp-cell${c.fk === format && c.mk === mode ? " is-here" : ""}`}>
                  <div className="dp-cell-k mono">{FORMATS[c.fk].label} · {MODES[c.mk].label}</div>
                  <div className="dp-cell-v">{ord(c.rank)}</div>
                  <div className="dp-cell-s mono">{p.pos}{c.posRank} · {c.score.toFixed(1)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </aside>
  );
}
