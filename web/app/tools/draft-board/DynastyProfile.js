"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import { FORMATS, GROUP_NAMES, MODES, pBetter, profileRead, scoreRows } from "@/lib/dynastyBoard";
import { formatHeight } from "@/lib/format";
import useFocusTrap from "../../useFocusTrap";
import ShareCardButton from "../../ShareCardButton";

const pct = (p) => (p >= 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
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
function AgeCurve({ curve, age, value }) {
  const W = 480, H = 130, L = 26, R = 8, T = 10, B = 22;
  const lo = curve[0][0], hi = curve.at(-1)[0];
  const x = (a) => L + ((a - lo) / (hi - lo)) * (W - L - R);
  const y = (v) => T + (1 - (v - 1) / 9) * (H - T - B);
  const a = Math.min(Math.max(age, lo), hi);
  return (
    <svg className="dp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Age value by age at his position">
      {[1, 5, 10].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="dp-grid" />
          <text x={L - 5} y={y(g) + 3} className="dp-axis" textAnchor="end">{g}</text>
        </g>
      ))}
      <rect x={x(a)} y={T} width={Math.max(0, x(Math.min(a + 3, hi)) - x(a))} height={H - T - B} className="dp-band" />
      <polyline className="dp-curve" points={curve.map(([ag, v]) => `${x(ag)},${y(v)}`).join(" ")} />
      <line x1={x(a)} x2={x(a)} y1={y(value)} y2={H - B} className="dp-drop" />
      <circle cx={x(a)} cy={y(value)} r="4.6" className="dp-dot" />
      {[25, 30, 35, 40].filter((t) => t >= lo && t <= hi).map((t) => <text key={t} x={x(t)} y={H - 6} className="dp-axis" textAnchor="middle">{t}</text>)}
      <text x={Math.min(x(a) + 8, W - R - 4)} y={y(value) - 8} className="dp-label is-level" textAnchor={x(a) > W - 90 ? "end" : "start"}>{age.toFixed(1)} · {value.toFixed(1)}</text>
    </svg>
  );
}

// ---- the panel -----------------------------------------------------------------------------------------------------
export default function DynastyProfile({ player: p, rows, L, board, format, mode, pos, meta, complete, onClose }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef);
  const data = useProfileData(p.id);
  const f = FORMATS[format], m = MODES[mode];

  useEffect(() => {
    const prevFocus = document.activeElement, prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; prevFocus?.focus?.(); };
  }, [onClose]);

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

  const repl = meta.replacement[format.toUpperCase()][p.pos];
  const curve = meta.ageCurve[p.pos];
  const kept = (() => { const c = curve.reduce((b, r) => (Math.abs(r[0] - p.age) < Math.abs(b[0] - p.age) ? r : b), curve[0]); return c[2]; })();
  const neighbours = [...L.slice(Math.max(0, i - 3), i), ...L.slice(i + 1, i + 4)];
  const size = [formatHeight(data?.bio?.height), data?.bio?.weight ? `${data.bio.weight} lbs` : null, data?.bio?.yearsExp != null ? (data.bio.yearsExp === 0 ? "Rookie" : `Year ${data.bio.yearsExp + 1}`) : null].filter(Boolean);
  const prodC = m.prod * p.prod, ageC = m.age * p.ageValue;
  const read = profileRead({ p, mode, repl, tied, ranks: grid?.map((c) => c.rank) });

  return (
    <div className="dp-overlay" onClick={onClose}>
      <aside ref={dialogRef} className="dp" role="dialog" aria-modal="true" aria-label={`${p.name}, dynasty profile`} onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="dp-close" onClick={onClose} aria-label="Close profile">×</button>

        <header className="dp-head">
          <div className="dp-photo">{data?.bio?.headshot ? <img src={data.bio.headshot} alt="" width="76" height="76" /> : <span>{p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>}</div>
          <div className="dp-id">
            <h2 className="dp-name">{p.name}</h2>
            <div className="dp-badges">
              <PositionBadge position={p.pos} />
              <TeamBadge team={p.team} />
              <span className="mono">{[`${p.age.toFixed(1)} yrs`, ...size].join(" · ")}</span>
            </div>
            <div className="dp-links">
              <Link href={`/tools/lab?p=${encodeURIComponent(p.name)}`}>The Lab →</Link>
              <Link href="/tools/redraft-rankings">Weekly rankings →</Link>
              <ShareCardButton
                card={{ kind: "d", id: p.id, f: format, m: mode }}
                caption={`${p.name} in dynasty: ${p.score.toFixed(1)} (${f.label}, ${m.label}).`}
                file={`singularity-dynasty-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                label="Share card"
              />
            </div>
          </div>
        </header>

        <section className="dp-score">
          <div className="dp-big">{p.score.toFixed(1)}</div>
          <div className="dp-score-side">
            <div className="dp-eyebrow mono">Dynasty score · {f.label} · {m.label}</div>
            <div className="dp-facts">
              {here && <span><b>{ord(here.rank)}</b> overall</span>}
              {here && <span><b>{p.pos}{here.posRank}</b></span>}
              <span><b>Tier {tier.ti + 1}</b> of {board.tiers.length}</span>
              <span>{GROUP_NAMES[group.g] || "Deep"}</span>
            </div>
            <div className="dp-range mono">80% range {p.lo.toFixed(1)}–{p.hi.toFixed(1)}{tier.beat != null ? ` · tier beats the next ${pct(tier.beat)}` : ""}</div>
          </div>
        </section>

        <p className="dp-read">{read}</p>

        <section className="dp-sec">
          <h3 className="board-panel-title">The recipe</h3>
          <div className="dp-recipe">
            <div className="dp-r-row">
              <span className="dp-r-name">Production over replacement</span>
              <span className="dp-r-val mono">{p.prod.toFixed(1)}</span>
              <span className="dp-r-w mono">× {Math.round(m.prod * 100)}%</span>
              <span className="dp-r-eq mono">{prodC.toFixed(1)}</span>
            </div>
            <div className="dp-r-sub mono">{p.ppg.toFixed(1)} PPG over his last {meta.window.games} games, replacement {p.pos} {repl.toFixed(1)} → {(p.ppg - repl >= 0 ? "+" : "") + (p.ppg - repl).toFixed(1)} a game</div>
            <div className="dp-r-row">
              <span className="dp-r-name">Age</span>
              <span className="dp-r-val mono">{p.ageValue.toFixed(1)}</span>
              <span className="dp-r-w mono">× {Math.round(m.age * 100)}%</span>
              <span className="dp-r-eq mono">{ageC.toFixed(1)}</span>
            </div>
            <div className="dp-r-sub mono">{p.pos}s of his age keep about {Math.round(kept * 100)}% of their production over the next three seasons</div>
            <div className="dp-stack" role="img" aria-label="Production and age shares of the score">
              <span className="dp-stack-prod" style={{ width: `${Math.max(0, prodC) * 10}%` }} />
              <span className="dp-stack-age" style={{ width: `${Math.max(0, ageC) * 10}%` }} />
            </div>
            <div className="dp-r-row is-total"><span className="dp-r-name">Dynasty score</span><span className="dp-r-eq mono">{p.score.toFixed(1)}</span></div>
          </div>
        </section>

        <section className="dp-sec">
          <h3 className="board-panel-title">Production, game by game</h3>
          {data?.log ? <Timeline log={data.log} level={p.ppg} repl={repl} /> : <div className="dp-chart-skel">{data ? "No game log yet." : "Loading his games…"}</div>}
          <p className="dp-cap">Each bar is a game. His level is weighted toward the newest, with a half-life of {meta.window.half_life} games.</p>
        </section>

        <section className="dp-sec">
          <h3 className="board-panel-title">His age curve</h3>
          <AgeCurve curve={curve} age={p.age} value={p.ageValue} />
          <p className="dp-cap">Age value for {p.pos}s from 2008–25: how much production players of that age kept over the next three seasons, counting those who dropped out. The shaded band is the three seasons.</p>
        </section>

        <section className="dp-sec">
          <h3 className="board-panel-title">Closest on the board</h3>
          {tied.length > 0 && <p className="dp-tied">Tied with {tied.map((r) => r.name).join(", ")}: the order inside the box is close to a coin flip.</p>}
          <table className="dp-table">
            <tbody>
              {neighbours.map((r) => {
                const pb = pBetter(p, r);
                return (
                  <tr key={r.id}>
                    <td className="mono dp-t-rank">{L.indexOf(r) + 1}</td>
                    <td className="dp-t-name">{r.name}</td>
                    <td className="mono">{r.score.toFixed(1)}</td>
                    <td className="mono dp-t-p">{pct(pb)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="dp-cap">The last column is how often {p.name.split(" ").slice(-1)[0]} is really better than that player, given how far next-season points miss.</p>
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
    </div>
  );
}
