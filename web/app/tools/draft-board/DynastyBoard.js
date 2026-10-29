"use client";

import { useMemo, useRef, useState } from "react";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import { FORMATS, GROUP_NAMES, MODES, boardRows, buildBoard } from "@/lib/dynastyBoard";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];
const pct = (p) => (p >= 0.995 ? ">99%" : `${Math.round(p * 100)}%`);

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

// The ranking drawn as a tabular recipe: player rows on the left, and boxes that merge rows on the right -- TIED (a coin flip
// inside), TIER, GROUP -- so the order, the cliffs and how sure each cliff is read left to right. See lib/dynastyBoard.js.
export default function DynastyBoard({ rows }) {
  const [format, setFormat] = useState("1qb");
  const [mode, setMode] = useState("contender");
  const [pos, setPos] = useState("ALL");
  const gridRef = useRef(null);

  const { L, groups, tiers, ties } = useMemo(() => {
    const L = boardRows(rows, { format, mode, pos });
    return { L, ...buildBoard(L) };
  }, [rows, format, mode, pos]);

  const lo = Math.floor(Math.min(...L.map((p) => p.lo))), hi = Math.ceil(Math.max(...L.map((p) => p.hi)));
  const x = (v) => ((v - lo) / (hi - lo)) * 100;
  const tierOf = (i) => tiers.findIndex((t) => i >= t.a && i <= t.b);
  // a heavier rule across the row where a tier (or, heavier, a group) starts
  const breakClass = (i) => {
    if (!i) return "";
    const a = tierOf(i - 1), b = tierOf(i);
    return a === b ? "" : tiers[a].g !== tiers[b].g ? " is-group-break" : " is-tier-break";
  };

  // hovering a tier box lights its players and steps everything else back; hovering a row lights the row
  const focus = (e) => {
    const g = gridRef.current;
    g.querySelectorAll(".is-lit").forEach((n) => n.classList.remove("is-lit"));
    const tier = e.target.closest(".dr-tier");
    g.classList.toggle("is-focus", !!tier);
    if (tier) g.querySelectorAll(`[data-t="${tier.dataset.t}"]`).forEach((n) => n.classList.add("is-lit"));
  };
  const blur = () => {
    gridRef.current.classList.remove("is-focus");
    gridRef.current.querySelectorAll(".is-lit").forEach((n) => n.classList.remove("is-lit"));
  };

  const m = MODES[mode];
  return (
    <>
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
          {Math.round(m.prod * 100)}% production · {Math.round(m.age * 100)}% age
        </span>
      </div>

      <div className="board-panel dr-panel">
        <div className="dr-grid" ref={gridRef} onMouseOver={focus} onMouseLeave={blur}>
          <div className="dr-h dr-c">#</div>
          <div className="dr-h">Player</div>
          <div className="dr-h dr-c dr-col-age">Age</div>
          <div className="dr-h"><span>Value · 80% range</span></div>
          <div className="dr-h dr-c" />
          <div className="dr-h">Tier</div>
          <div className="dr-h dr-c dr-col-group" />

          {L.map((p, i) => {
            const t = tierOf(i), b = breakClass(i), at = { "data-t": t, "data-i": i };
            return [
              <div key={`r${i}`} {...at} className={`dr-cell dr-rank${b}`} style={{ gridRow: i + 2, gridColumn: 1 }}>{i + 1}</div>,
              <div key={`n${i}`} {...at} className={`dr-cell dr-who${b}`} style={{ gridRow: i + 2, gridColumn: 2 }}>
                <PositionBadge position={p.pos} />
                <TeamBadge team={p.team} />
                <b>{p.name}</b>
              </div>,
              <div key={`a${i}`} {...at} className={`dr-cell dr-age dr-col-age${b}`} style={{ gridRow: i + 2, gridColumn: 3 }}>{p.age.toFixed(1)}</div>,
              <div key={`v${i}`} {...at} className={`dr-cell dr-val${b}`} style={{ gridRow: i + 2, gridColumn: 4 }}>
                <span className="dr-track">
                  <span className="dr-range" style={{ left: `${x(p.lo)}%`, width: `${x(p.hi) - x(p.lo)}%` }} />
                  <span className="dr-med" style={{ left: `${x(p.score)}%` }} />
                </span>
                <em>{p.score.toFixed(1)}</em>
              </div>,
            ];
          })}

          {ties.map((t) => (
            <div key={`x${t.a}`} data-t={t.ti} className={`dr-box dr-tie${t.b > t.a ? " is-multi" : ""}${breakClass(t.a)}`} style={{ gridRow: `${t.a + 2} / span ${t.b - t.a + 1}`, gridColumn: 5 }}>
              <div className="dr-in">{t.b > t.a && <span>Tied</span>}</div>
            </div>
          ))}

          {tiers.map((t) => {
            const n = t.b - t.a + 1, ages = L.slice(t.a, t.b + 1).map((p) => p.age);
            const label = t.groupBreak ? GROUP_NAMES[t.g + 1] || "next group" : `Tier ${t.ti + 2}`;
            const beat = t.beat != null && (
              <div className="dr-beat">
                <span>Beats {label}</span>
                <b>{pct(t.beat)}</b>
              </div>
            );
            // a box is 46px a player: a 1-player tier is one line (name left, the beat figure right), a 2-player tier drops
            // the score / age line, and only 3 or more has room for the full label and the strip at its foot
            return (
              <div key={`t${t.ti}`} data-t={t.ti} className={`dr-box dr-tier g${Math.min(t.g, 3)}${n === 1 ? " is-one" : n === 2 ? " is-short" : ""}${breakClass(t.a)}`} style={{ gridRow: `${t.a + 2} / span ${n}`, gridColumn: 6 }}>
                <div className="dr-in">
                  <div className="dr-t1">
                    Tier {t.ti + 1}
                    <small>{n} player{n > 1 ? "s" : ""}</small>
                    {n === 1 && t.beat != null && <b className="dr-beat-one">{pct(t.beat)}</b>}
                  </div>
                  {n >= 3 && (
                    <div className="dr-t3">
                      score {L[t.b].score.toFixed(1)}–{L[t.a].score.toFixed(1)} · ages {Math.min(...ages).toFixed(0)}–{Math.max(...ages).toFixed(0)}
                    </div>
                  )}
                  {n === 2 && beat}
                </div>
                {n >= 3 && beat}
              </div>
            );
          })}

          {groups.map((G) => (
            <div key={`g${G.g}`} className={`dr-box dr-group dr-col-group g${Math.min(G.g, 3)}${breakClass(G.a)}`} style={{ gridRow: `${G.a + 2} / span ${G.b - G.a + 1}`, gridColumn: 7 }}>
              <div className="dr-in">
                <span className="dr-gn" style={{ fontSize: Math.min(21, ((G.b - G.a + 1) * 46 - 28) / ((GROUP_NAMES[G.g] || "").length * 0.62)) }}>{GROUP_NAMES[G.g] || ""}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="dr-notes">
        <div className="board-panel dr-note">
          <h3 className="board-panel-title">How the boxes are drawn</h3>
          <p>
            Every box comes from one rule: how often is a player really better than the player below him? <b>Tied</b>: no one inside beats anyone below
            him more than 55% of the time, so the order inside is close to a coin flip. <b>Tier</b>: no more than 65%. <b>Group</b>: no more than 80%.
            Each uses the fewest boxes that rule allows, split at the biggest drops.
          </p>
        </div>
        <div className="board-panel dr-note">
          <h3 className="board-panel-title">The red line</h3>
          <p>
            At the foot of a tier: how often one of its players ends up better than one from the next tier. The grey bar on each row is the 80% range
            of his value, from how far last-season-style projections miss. Where bars overlap, the order between those players is not settled.
          </p>
        </div>
        <div className="board-panel dr-note">
          <h3 className="board-panel-title">Value</h3>
          <p>
            Recency-weighted points per game over a replacement-level player at his position (replacement is set by how many starters the format needs),
            blended with how well his position keeps its production at his age. Contender leans on production; Rebuilder gives age more weight.
          </p>
        </div>
      </div>
    </>
  );
}
