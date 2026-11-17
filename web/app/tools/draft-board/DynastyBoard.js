"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import DynastyProfile from "./DynastyProfile";
import { FORMATS, MODES, viewBoard } from "@/lib/dynastyBoard";
import { coachFor, acquiringGm } from "@/lib/teamStaff";
import { normalizePlayerName } from "@/lib/portfolio";

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

// The whole view on one axis (the "spread"): every player a mark at his score, stacked where scores are close, the tiers as
// alternating bands behind them and the groups as brackets under the axis. Click a mark to open that player.
function Spread({ L, tiers, groups, openId, onPick }) {
  if (!L.length) return null;
  const lo = Math.floor(Math.min(...L.map((p) => p.score)) * 2) / 2, hi = Math.ceil(Math.max(...L.map((p) => p.score)) * 2) / 2;
  const x = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  const stack = new Map();
  const marks = L.map((p) => {
    const bin = Math.round(p.score * 10);
    const k = stack.get(bin) || 0;
    stack.set(bin, k + 1);
    return { p, k };
  });
  const depth = Math.max(...stack.values());
  const ticks = [];
  for (let v = Math.ceil(lo); v <= hi; v++) ticks.push(v);
  const span = (a, b) => ({ left: `${x(L[b].score)}%`, width: `${Math.max(0.4, x(L[a].score) - x(L[b].score))}%` });
  return (
    <div className="dyb-spread" style={{ "--depth": depth }}>
      <div className="dyb-spread-plot">
        {tiers.map((t, ti) => (
          <div key={ti} className={`dyb-spread-tier${ti % 2 ? " is-alt" : ""}`} style={span(t.a, t.b)}>
            {x(L[t.a].score) - x(L[t.b].score) > 2.5 && <span>{ti + 1}</span>}
          </div>
        ))}
        {marks.map(({ p, k }) => (
          <button
            key={p.id}
            type="button"
            className={`dyb-mark${p.id === openId ? " is-open" : ""}`}
            style={{ left: `${x(p.score)}%`, bottom: `${k * 6 + 3}px` }}
            aria-label={`${p.name}, ${p.score.toFixed(1)}`}
            onClick={() => onPick(p.id)}
          />
        ))}
      </div>
      <div className="dyb-spread-axis">
        {ticks.map((v) => <span key={v} style={{ left: `${x(v)}%` }}>{v}</span>)}
      </div>
      <div className="dyb-spread-groups">
        {groups.map((g, gi) => (
          <div key={gi} style={span(g.a, g.b)}>
            <span>{g.name}</span>
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
  const [query, setQuery] = useState("");
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
    return viewBoard(rows, { format, mode, pos }); // a position view keeps the all-positions groups
  }, [rows, format, mode, pos]);

  // one axis for every row's range: whole numbers from 0, so grid line N is a score of N on every view (founder, Nov 16 2026);
  // a range reaching below zero runs off the left edge rather than squeezing every row
  const lo = 0, hi = L.length ? Math.ceil(Math.max(...L.map((p) => p.hi))) : 1;
  const x = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const ticks = []; // labelled every other point when the axis is long; the grid keeps every point
  for (let v = lo; v <= hi; v += hi - lo > 8 ? 2 : 1) ticks.push(v);
  // the name search: rows that don't match are hidden (ranks, groups and tiers stay the board's), a heading shows only above a match
  const q = normalizePlayerName(query);
  const hit = q ? L.map((p) => normalizePlayerName(p.name).includes(q)) : null;
  const shows = (a, b) => !hit || hit.slice(a, b + 1).includes(true);
  const firstShown = (a, b) => (hit ? a + hit.slice(a, b + 1).indexOf(true) : a);
  // The pane shows the picked player while he is on the list (and matches the search), else the top one shown.
  const open = L.find((p, i) => p.id === pickedId && (!hit || hit[i])) || L.find((_, i) => !hit || hit[i]) || L.find((p) => p.id === pickedId) || L[0] || null;

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
        <label className="rk-search dyb-search">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2" />
          </svg>
          <input type="search" placeholder="Search a player's name…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search players" />
        </label>
        <button type="button" className="rankings-theater-btn" onClick={() => setTheater((v) => !v)} aria-label={theater ? "Exit full-screen view" : "Expand to full-screen view"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {theater ? <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M4 15h3a2 2 0 0 1 2 2v3M15 20v-3a2 2 0 0 1 2-2h3" /> : <path d="M9 4H6a2 2 0 0 0-2 2v3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M15 20h3a2 2 0 0 0 2-2v-3" />}
          </svg>
        </button>
      </div>

      {!theater && L.length > 0 && (
        <section className="dyb-overview glass-panel" aria-label="Every player on one axis">
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
          <div className="dyb-rows" ref={listRef}>
            {/* the header scrolls inside the same box as the rows (pinned to its top), so the axis labels are laid out at exactly the rows' width */}
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
            {L.map((p, i) => {
              const ti = tiers.findIndex((t) => i >= t.a && i <= t.b);
              const t = tiers[ti];
              const tie = !hit && ties.find((z) => i >= z.a && i <= z.b && z.b > z.a); // no tie brackets while searching (the tied rows may be hidden)
              const n = t.b - t.a + 1;
              const g = groups[t.g];
              const gn = g ? g.b - g.a + 1 : 0;
              const band = { left: x(L[t.b].score), width: `calc(${x(L[t.a].score)} - ${x(L[t.b].score)})` };
              return (
                <Fragment key={p.id}>
                  {g && i === firstShown(g.a, g.b) && shows(g.a, g.b) && (
                    <div className="dyb-group">
                      <span className="dyb-group-ix mono">{String(t.g + 1).padStart(2, "0")}</span>
                      <b>{g.name}</b>
                      <span className="dyb-group-n mono">{gn} player{gn > 1 ? "s" : ""} · {L[g.b].score.toFixed(1)}–{L[g.a].score.toFixed(1)}</span>
                    </div>
                  )}
                  {i === firstShown(t.a, t.b) && shows(t.a, t.b) && (
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
                    hidden={hit ? !hit[i] : undefined}
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
                      {/* his move over the last driftGames games, drawn from where his score was to where it is: cobalt right = up, ember left = down */}
                      {p.move != null && Math.abs(p.move) >= 1 && (
                        <i
                          className={`dyb-move is-${p.move > 0 ? "up" : "down"}`}
                          style={{ left: x(Math.min(p.score, p.score - p.move)), width: `calc(${x(Math.max(p.score, p.score - p.move))} - ${x(Math.min(p.score, p.score - p.move))})` }}
                          role="img"
                          aria-label={`Score ${p.move > 0 ? "up" : "down"} ${Math.abs(p.move).toFixed(1)} over his last ${p.driftGames} games`}
                        />
                      )}
                    </span>
                  </button>
                </Fragment>
              );
            })}
            {hit && !hit.includes(true) && <p className="dyb-none mono">No player on this board matches “{query}”.</p>}
          </div>
          <div className="dyb-key mono">
            <span><i className="k-ci" /> 80% range</span>
            <span><i className="k-pt" /> score (relative: the board&apos;s best = 10)</span>
            <span><i className="k-band" /> tier&apos;s score span</span>
            <span><i className="dyb-move is-up k-move" /><i className="dyb-move is-down k-move" /> score over his last 9 games: up / down</span>
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
