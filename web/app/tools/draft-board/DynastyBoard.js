"use client";

import { Fragment, useMemo, useState } from "react";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import DynastyProfile from "./DynastyProfile";
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

// The dynasty rankings as a board: a headline strip, the ranked list (tier and group headings between the rows, a mint bracket where players
// are tied) and the picked player's profile in a pane beside it. Tiers, groups and ties come from lib/dynastyBoard.js.
export default function DynastyBoard({ rows, meta, complete }) {
  const [format, setFormat] = useState("sf");
  const [mode, setMode] = useState("contender");
  const [pos, setPos] = useState("ALL");
  const [pickedId, setPickedId] = useState(null);

  const { L, groups, tiers, ties } = useMemo(() => {
    const L = boardRows(rows, { format, mode, pos });
    return { L, ...buildBoard(L) };
  }, [rows, format, mode, pos]);

  const lo = Math.floor(Math.min(...L.map((p) => p.lo))), hi = Math.ceil(Math.max(...L.map((p) => p.hi)));
  const x = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const m = MODES[mode];
  // The pane shows the picked player while he is on the list, else the top one.
  const open = L.find((p) => p.id === pickedId) || L[0] || null;
  const top = tiers[0] ? L.slice(tiers[0].a, tiers[0].b + 1) : [];
  const youngest = top.reduce((b, p) => (!b || p.age < b.age ? p : b), null);

  const cell = (n, label, sub, tone) => (
    <div className="dyb-strip-cell">
      <div className={`dyb-strip-n${tone ? ` is-${tone}` : ""}`}>{n}</div>
      <div className="dyb-strip-l">{label}</div>
      {sub && <div className="dyb-strip-s">{sub}</div>}
    </div>
  );

  return (
    <>
      <div className="dyb-strip">
        {cell(L.length, "Players ranked", `${FORMATS[format].label} · ${m.label}`)}
        {cell(L[0] ? L[0].score.toFixed(1) : "—", "Top score", L[0] && `${L[0].name} · ${L[0].pos}`, "up")}
        {cell(tiers.length, "Tiers", `${groups.length} groups`)}
        {cell(groups[0] ? groups[0].b - groups[0].a + 1 : 0, GROUP_NAMES[0] || "Top group", "players in the top group")}
        {cell(youngest ? youngest.age.toFixed(1) : "—", "Youngest in tier 1", youngest && youngest.name)}
      </div>

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

      <div className="dyb-shell">
        <div className="dyb-list glass-panel">
          <div className="dyb-head">
            <span>#</span>
            <span>Player</span>
            <span>Score</span>
            <span>80% range</span>
          </div>
          <div className="dyb-rows">
            {L.map((p, i) => {
              const ti = tiers.findIndex((t) => i >= t.a && i <= t.b);
              const t = tiers[ti];
              const tie = ties.find((z) => i >= z.a && i <= z.b && z.b > z.a);
              const n = t.b - t.a + 1;
              const nextLabel = t.groupBreak ? GROUP_NAMES[t.g + 1] || "the next group" : `Tier ${ti + 2}`;
              return (
                <Fragment key={p.id}>
                  {i === t.a && groups[t.g]?.a === i && <div className="dyb-group">{GROUP_NAMES[t.g] || "Deep"}</div>}
                  {i === t.a && (
                    <div className="dyb-tier">
                      <b>Tier {ti + 1}</b>
                      <span>
                        {n} player{n > 1 ? "s" : ""}
                        {n > 1 && ` · score ${L[t.b].score.toFixed(1)}–${L[t.a].score.toFixed(1)}`}
                      </span>
                      {t.beat != null && (
                        <em>
                          Beats {nextLabel} {pct(t.beat)}
                        </em>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`dyb-row${open?.id === p.id ? " is-selected" : ""}${i < 3 ? " is-top" : ""}${tie ? ` is-tied${i === tie.a ? " tie-first" : ""}${i === tie.b ? " tie-last" : ""}` : ""}`}
                    aria-pressed={open?.id === p.id}
                    onClick={() => setPickedId(p.id)}
                  >
                    <span className="dyb-rank">{i + 1}</span>
                    <span className="dyb-who">
                      <span className="dyb-name-line">
                        <TeamBadge team={p.team} />
                        <b className="dyb-name">{p.name}</b>
                        <PositionBadge position={p.pos} />
                        {p.form && p.form.dir !== "flat" && (
                          <span className={`dr-form is-${p.form.dir}`} role="img" aria-label={`Last ${p.form.games} games: ${p.form.recent.toFixed(1)} a game, ${Math.abs(p.form.delta).toFixed(1)} ${p.form.dir === "up" ? "above" : "below"} his usual level`}>
                            {p.form.dir === "up" ? "▲" : "▼"}
                          </span>
                        )}
                      </span>
                      <span className="dyb-sub">
                        {p.age.toFixed(1)} yrs{tie && i === tie.a ? " · tied" : ""}
                      </span>
                    </span>
                    <span className="dyb-score">{p.score.toFixed(1)}</span>
                    <span className="dyb-range">
                      <span className="dyb-led">
                        <i style={{ left: x(p.lo), width: `calc(${x(p.hi)} - ${x(p.lo)})` }} />
                        <b style={{ left: x(p.score) }} />
                      </span>
                      <span className="dyb-led-n">
                        <span>{p.lo.toFixed(1)}</span>
                        <span>{p.hi.toFixed(1)}</span>
                      </span>
                    </span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
        <div className="dyb-pane">
          {open && <DynastyProfile key={`${open.id}-${format}-${mode}`} player={open} rows={rows} L={L} board={{ groups, tiers, ties }} format={format} mode={mode} meta={meta} complete={complete} />}
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
            blended with how well his position keeps its production at his age. Contender leans on production over his last 34 games; Rebuilder gives age more weight and reads only his last 17.
          </p>
        </div>
      </div>
    </>
  );
}
