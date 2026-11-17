"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import DynastyProfile from "./DynastyProfile";
import { FORMATS, GROUP_NAMES, MODES, boardRows, buildBoard } from "@/lib/dynastyBoard";
import { coachFor, acquiringGm } from "@/lib/teamStaff";

// the two context columns: short words, the full sentence for screen readers
const GM_WORD = { yes: "Yes", no: "No", undrafted: "UDFA", unknown: "—" };
const HOW = { drafted: "Drafted", trade: "Traded for", joined: "Brought in" };

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];

// One toggle: a recessed track of buttons, the picked one lit (the site's .board-toggle look).
function Toggle({ label, value, options, onChange }) {
  return (
    <div className="board-toggle dr-toggle" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" className={value === key ? "active" : ""} aria-pressed={value === key} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  );
}

// The whole view as a map: every player a dot at his score (across) and his age (down: youngest at the top), coloured by
// position, the tiers as alternating vertical bands behind them and the groups as brackets under the score axis.
// Hover or focus a dot for his name; click it to open that player.
const POS_KEYS = ["QB", "RB", "WR", "TE"];
function Spread({ L, tiers, groups, openId, onPick }) {
  if (!L.length) return null;
  const lo = Math.floor(Math.min(...L.map((p) => p.score)) * 2) / 2, hi = Math.ceil(Math.max(...L.map((p) => p.score)) * 2) / 2;
  const ages = L.map((p) => p.age).filter((a) => a != null);
  const aLo = Math.floor(Math.min(...ages)), aHi = Math.ceil(Math.max(...ages));
  const x = (v) => 2 + ((v - lo) / (hi - lo || 1)) * 96; // 2% in from each side so an edge dot isn't cut off
  const y = (a) => ((a - aLo) / (aHi - aLo || 1)) * 100;
  const ticks = [];
  for (let v = Math.ceil(lo); v <= hi; v++) ticks.push(v);
  const aStep = aHi - aLo > 10 ? 4 : 2, aTicks = [];
  for (let a = Math.ceil(aLo / aStep) * aStep; a <= aHi; a += aStep) aTicks.push(a);
  const span = (a, b) => ({ left: `${x(L[b].score)}%`, width: `${Math.max(0.4, x(L[a].score) - x(L[b].score))}%` });
  const shown = POS_KEYS.filter((k) => L.some((p) => p.pos === k));
  return (
    <div className="dyb-spread">
      <div className="dyb-spread-legend mono" aria-hidden="true">
        {shown.map((k) => <span key={k}><i style={{ background: `var(--pos-${k.toLowerCase()})` }} />{k}</span>)}
        <span className="dyb-spread-legend-read">Across: dynasty score · Down: age, youngest at the top</span>
      </div>
      <div className="dyb-spread-frame">
        <div className="dyb-spread-yaxis mono" aria-hidden="true">
          {aTicks.map((a) => <span key={a} style={{ top: `${y(a)}%` }}>{a}</span>)}
        </div>
        <div className="dyb-spread-plot">
          {tiers.map((t, ti) => (
            <div key={ti} className={`dyb-spread-tier${ti % 2 ? " is-alt" : ""}`} style={span(t.a, t.b)}>
              {x(L[t.a].score) - x(L[t.b].score) > 2.5 && <span>{ti + 1}</span>}
            </div>
          ))}
          <div className="dyb-spread-area">
          {aTicks.map((a) => <div key={a} className="dyb-spread-grid" style={{ top: `${y(a)}%` }} />)}
          {L.map((p) => p.age != null && (
            <button
              key={p.id}
              type="button"
              className={`dyb-mark${p.id === openId ? " is-open" : ""}${x(p.score) > 75 ? " is-right" : ""}`}
              style={{ left: `${x(p.score)}%`, top: `${y(p.age)}%`, "--c": `var(--pos-${String(p.pos).toLowerCase()})` }}
              aria-label={`${p.name}, ${p.pos}, age ${p.age.toFixed(1)}, score ${p.score.toFixed(1)}`}
              onClick={() => onPick(p.id)}
            >
              <b>{p.name} <em>{p.score.toFixed(1)}</em></b>
            </button>
          ))}
          </div>
        </div>
      </div>
      <div className="dyb-spread-axis">
        {ticks.map((v) => <span key={v} style={{ left: `${x(v)}%` }}>{v}</span>)}
      </div>
      <div className="dyb-spread-groups">
        {groups.map((g, gi) => (
          <div key={gi} style={span(g.a, g.b)}>
            <span>{GROUP_NAMES[gi] || "Deep"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The dynasty rankings as a board: the spread on top, then the ranked list (group and tier headings between the rows, each
// player's 80% range on one shared axis, his tier's score span shaded behind it) and the picked player's profile beside it.
// Tiers, groups and ties come from lib/dynastyBoard.js.
export default function DynastyBoard({ rows, meta }) {
  const [format, setFormat] = useState("sf");
  const [mode, setMode] = useState("contender");
  const [pos, setPos] = useState("ALL");
  const [pickedId, setPickedId] = useState(null);
  const listRef = useRef(null);
  // Full screen: just the controls, the list and the profile -- no page header or spread. Escape leaves it; the page doesn't scroll behind it.
  const [theater, setTheater] = useState(false);
  useEffect(() => {
    if (!theater) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && setTheater(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [theater]);

  const { L, groups, tiers, ties } = useMemo(() => {
    const L = boardRows(rows, { format, mode, pos });
    return { L, ...buildBoard(L) };
  }, [rows, format, mode, pos]);

  // one axis for every row's range: whole numbers, so the grid lines are whole points of score
  // (from 0 at the lowest: a range reaching below zero runs off the left edge rather than squeezing every row)
  const lo = L.length ? Math.max(0, Math.floor(Math.min(...L.map((p) => p.lo)))) : 0, hi = L.length ? Math.ceil(Math.max(...L.map((p) => p.hi))) : 1;
  const x = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const ticks = []; // labelled every other point when the axis is long; the grid keeps every point
  for (let v = lo; v <= hi; v += hi - lo > 8 ? 2 : 1) ticks.push(v);
  const m = MODES[mode];
  // The pane shows the picked player while he is on the list, else the top one.
  const open = L.find((p) => p.id === pickedId) || L[0] || null;

  // picking from the spread brings his row into view inside the list
  const pickAndShow = (id) => {
    setPickedId(id);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" }));
  };

  return (
    <div className={theater ? "dyb-theater" : undefined}>
      <div className="dr-controls">
        <Toggle label="Mode" value={mode} onChange={setMode} options={Object.entries(MODES).map(([k, v]) => [k, v.label])} />
        <Toggle label="League format" value={format} onChange={setFormat} options={Object.entries(FORMATS).map(([k, v]) => [k, v.label])} />
        <div className="rk-positions" role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <button key={p} type="button" className={pos === p ? "active" : ""} onClick={() => setPos(p)}>
              {p === "ALL" ? "All" : p}
            </button>
          ))}
        </div>
        <span className="dr-read mono">
          Score = {Math.round(m.prod * 100)}% production + {Math.round(m.age * 100)}% age
        </span>
        <button type="button" className="rankings-theater-btn" onClick={() => setTheater((v) => !v)} aria-label={theater ? "Exit full-screen view" : "Expand to full-screen view"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {theater ? <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M4 15h3a2 2 0 0 1 2 2v3M15 20v-3a2 2 0 0 1 2-2h3" /> : <path d="M9 4H6a2 2 0 0 0-2 2v3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M15 20h3a2 2 0 0 0 2-2v-3" />}
          </svg>
        </button>
      </div>

      {!theater && L.length > 0 && (
        <section className="dyb-overview glass-panel" aria-label="Every player by score and age">
          <div className="dyb-overview-key">
            <div className="dyb-overview-n">{L.length}</div>
            <div className="dyb-overview-l mono">players on the board</div>
            <dl className="dyb-overview-dl mono">
              <dt>Tiers</dt><dd>{tiers.length}</dd>
              <dt>Groups</dt><dd>{groups.length}</dd>
            </dl>
          </div>
          <Spread L={L} tiers={tiers} groups={groups} openId={open?.id} onPick={pickAndShow} />
        </section>
      )}

      <div className="dyb-shell">
        <div className="dyb-list glass-panel">
          <div className="dyb-head">
            <span>Rk</span>
            <span>Player</span>
            <span className="dyb-ctx">HC was OC</span>
            <span className="dyb-ctx">GM still there</span>
            <span>Score</span>
            <span className="dyb-axis" style={{ "--n": hi - lo }}>
              {ticks.map((v) => <i key={v} style={{ left: x(v) }}>{v}</i>)}
            </span>
          </div>
          <div className="dyb-rows" ref={listRef}>
            {L.map((p, i) => {
              const ti = tiers.findIndex((t) => i >= t.a && i <= t.b);
              const t = tiers[ti];
              const tie = ties.find((z) => i >= z.a && i <= z.b && z.b > z.a);
              const n = t.b - t.a + 1;
              const g = groups[t.g];
              const gn = g ? g.b - g.a + 1 : 0;
              const band = { left: x(L[t.b].score), width: `calc(${x(L[t.a].score)} - ${x(L[t.b].score)})` };
              return (
                <Fragment key={p.id}>
                  {i === t.a && g?.a === i && (
                    <div className="dyb-group">
                      <span className="dyb-group-ix mono">{String(t.g + 1).padStart(2, "0")}</span>
                      <b>{GROUP_NAMES[t.g] || "Deep"}</b>
                      <span className="dyb-group-n mono">{gn} player{gn > 1 ? "s" : ""} · {L[g.b].score.toFixed(1)}–{L[g.a].score.toFixed(1)}</span>
                    </div>
                  )}
                  {i === t.a && (
                    <div className="dyb-tier">
                      <b>Tier {ti + 1}</b>
                      <span className="mono">
                        {n} player{n > 1 ? "s" : ""}
                        {n > 1 && ` · ${L[t.b].score.toFixed(1)}–${L[t.a].score.toFixed(1)}`}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    data-id={p.id}
                    className={`dyb-row${open?.id === p.id ? " is-selected" : ""}${tie ? ` is-tie${i === tie.a ? " is-tie-a" : ""}${i === tie.b ? " is-tie-b" : ""}` : ""}`}
                    aria-pressed={open?.id === p.id}
                    onClick={() => setPickedId(p.id)}
                  >
                    <span className="dyb-rank mono">{i + 1}</span>
                    <span className="dyb-who">
                      <span className="dyb-name-line">
                        <TeamBadge team={p.team} />
                        <b className="dyb-name">{p.name}</b>
                        <PositionBadge position={p.pos} />
                      </span>
                      <span className="dyb-sub mono">
                        {p.age.toFixed(1)} yrs
                        {p.move != null && Math.abs(p.move) >= 1 && (
                          <span className={`dr-form is-${p.move > 0 ? "up" : "down"}`}>
                            {p.move > 0 ? "▲ +" : "▼ −"}{Math.abs(p.move).toFixed(1)} last {p.driftGames} games
                          </span>
                        )}
                      </span>
                    </span>
                    {(() => {
                      const c = coachFor(p.team), d = acquiringGm(p);
                      return (
                        <>
                          <span className={`dyb-ctx mono${c?.oc ? " is-yes" : ""}`} aria-label={c ? `Head coach ${c.hc} ${c.oc ? "was" : "was never"} an offensive coordinator` : "Head coach unknown"}>
                            {c ? (c.oc ? "Yes" : "No") : "—"}
                          </span>
                          <span className={`dyb-ctx mono${d.state === "yes" ? " is-yes" : ""}`} aria-label={d.state === "yes" ? `${HOW[d.how]} by ${d.gm}, still the GM` : d.state === "no" ? "The GM who brought him in is gone" : d.state === "undrafted" ? "Undrafted" : "Unknown"}>
                            {GM_WORD[d.state]}
                          </span>
                        </>
                      );
                    })()}
                    <span className="dyb-score">{p.score.toFixed(1)}</span>
                    <span className="dyb-plot" style={{ "--n": hi - lo }} role="img" aria-label={`80% range ${p.lo.toFixed(1)} to ${p.hi.toFixed(1)}`}>
                      <i className="dyb-band" style={band} />
                      <i className="dyb-ci" style={{ left: x(p.lo), width: `calc(${x(p.hi)} - ${x(p.lo)})` }} />
                      <i className="dyb-pt" style={{ left: x(p.score) }} />
                    </span>
                  </button>
                </Fragment>
              );
            })}
          </div>
          <div className="dyb-key mono">
            <span><i className="k-ci" /> 80% range</span>
            <span><i className="k-pt" /> score (relative: the board&apos;s best = 10)</span>
            <span><i className="k-band" /> tier&apos;s score span</span>
            <span><i className="k-tie" /> ≈ too close to call: the order inside is a coin flip</span>
            <span>HC was OC: his head coach was once an NFL offensive coordinator</span>
            <span>GM still there: the GM who drafted him, traded for him or signed him still runs his team</span>
            <span>Same score: HC was OC first, then GM still there (both first of all)</span>
          </div>
        </div>
        <div className="dyb-pane">
          {open && <DynastyProfile key={`${open.id}-${format}-${mode}`} player={open} rows={rows} L={L} board={{ groups, tiers, ties }} format={format} mode={mode} meta={meta} />}
        </div>
      </div>
    </div>
  );
}
