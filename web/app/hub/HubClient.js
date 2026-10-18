"use client";

import { useState } from "react";
import Link from "next/link";
import TeamBadge from "../tools/TeamBadge";
import { ARCHETYPE_SHORT } from "@/lib/archetypes";
import {
  POSITIONS,
  buildMovers,
  buildRangeLeaders,
  buildHotCold,
  buildLeanGroups,
  buildStageBars,
  buildAgeCurve,
  buildStageList,
} from "@/lib/hubCalc";

// The landing page's data hub: two tabs (this week / dynasty & offseason), a position filter that applies to every
// module, and a set of small infographic cards. Which modules show, and in what order, comes from lib/hubConfig.js; the
// data is free-depth only (see app/hub/hubData.js).

const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1));
const int = (v) => (v == null ? "—" : String(Math.round(v)));

function Card({ title, sub, href, cta, wide, children }) {
  return (
    <article className={`hub-card${wide ? " hub-card-wide" : ""}`}>
      <header className="hub-card-head">
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {href && (
          <Link href={href} className="hub-card-link">
            {cta || "See all"} →
          </Link>
        )}
      </header>
      {children}
    </article>
  );
}

const PosTag = ({ pos }) => <span className={`hub-pos hub-pos-${pos}`}>{pos}</span>;
// A name that shortens with an ellipsis while its position tag always stays visible.
const Nm = ({ n, pos, cls }) => (
  <span className={`hub-nm ${cls || ""}`}>
    <span className="hub-nm-t">{n}</span>
    {pos && <PosTag pos={pos} />}
  </span>
);

/* ---------------- this week ---------------- */

function MoverRow({ p, maxAbs }) {
  const up = p.delta > 0;
  return (
    <li className="hub-mover">
      <Nm n={p.n} pos={p.pos} cls="hub-mover-name" />
      <span className="hub-diverge" aria-hidden="true">
        <span className={`hub-diverge-bar ${up ? "up" : "down"}`} style={{ width: `${(Math.abs(p.delta) / maxAbs) * 100}%` }} />
      </span>
      <span className={`hub-mover-delta ${up ? "up" : "down"}`}>
        {up ? "+" : "−"}
        {Math.abs(p.delta).toFixed(1)}
      </span>
      <span className="hub-mover-vals">
        {fmt1(p.prev)} → {fmt1(p.proj)}
      </span>
    </li>
  );
}

function Movers({ data, pos, limit }) {
  const m = buildMovers(data.players, { pos, limit });
  if (!m.risers.length && !m.fallers.length) return null;
  return (
    <Card title="Biggest movers" sub="Change in median projection since last week" href="/tools/redraft-rankings" cta="Full rankings">
      <div className="hub-split">
        <div>
          <h4 className="hub-subhead up">Risers</h4>
          <ul className="hub-list">{m.risers.map((p) => <MoverRow key={p.n} p={p} maxAbs={m.maxAbs} />)}</ul>
        </div>
        <div>
          <h4 className="hub-subhead down">Fallers</h4>
          <ul className="hub-list">{m.fallers.map((p) => <MoverRow key={p.n} p={p} maxAbs={m.maxAbs} />)}</ul>
        </div>
      </div>
    </Card>
  );
}

// `highlight`: which of the three numbers is the big gold one (the ceiling on the ceilings card, the median on the season outlook card).
function RangeRow({ r, max, highlight = "hi" }) {
  return (
    <li className="hub-range-row">
      <Nm n={r.n} pos={r.pos} cls="hub-range-name" />
      <span className="hub-range-track" title={`Floor ${int(r.lo)} · median ${int(r.mid)} · ceiling ${int(r.hi)}`}>
        <span className="hub-range-span" style={{ left: `${(r.lo / max) * 100}%`, width: `${((r.hi - r.lo) / max) * 100}%` }} />
        <span className="hub-range-median" style={{ left: `${(r.mid / max) * 100}%` }} />
      </span>
      <span className="hub-range-nums">
        {highlight === "mid" ? (
          <>
            <i>{int(r.lo)}–</i>
            <b>{int(r.mid)}</b>
            <i>–{int(r.hi)}</i>
          </>
        ) : (
          <>
            <i>
              {int(r.lo)}–{int(r.mid)}–
            </i>
            <b>{int(r.hi)}</b>
          </>
        )}
      </span>
    </li>
  );
}

function Ceilings({ data, pos, limit }) {
  const { list, max } = buildRangeLeaders(data.players, { pos, limit });
  if (!list.length) return null;
  return (
    <Card title="Highest ceilings this week" sub="Floor to ceiling, with the median marked (top 50 shown)" href="/tools/redraft-rankings" cta="Full rankings">
      <ul className="hub-list">{list.map((r) => <RangeRow key={r.n} r={r} max={max} />)}</ul>
      <p className="hub-foot">Bar = floor to ceiling · tick = median · right: floor–median–ceiling</p>
    </Card>
  );
}

function Matchups({ data, pos, limit }) {
  const playing = data.playingDefs && data.playingDefs.length ? new Set(data.playingDefs) : null;
  const groups = buildLeanGroups(playing ? data.leans.filter((l) => playing.has(l.def)) : data.leans, { pos, limit });
  if (!groups.length) return null;
  return (
    <Card title="Matchup spots" sub="Defenses with the strongest trends against a position" href="/tools/redraft-rankings" cta="See the badges">
      <ul className="hub-list">
        {groups.map((g) => (
          <li key={g.def} className="hub-lean-row">
            <TeamBadge team={g.def} />
            <span className="hub-lean-chips">
              {g.items.map((l) => {
                const smash = l.call === "SMASH";
                return (
                  <span
                    key={l.pos}
                    className={`hub-lean ${smash ? "smash" : "tough"}`}
                    title={`${g.def} ${smash ? "gives up" : "shuts down"} ${l.pos} scoring: ${l.effect > 0 ? "+" : "−"}${Math.abs(l.effect).toFixed(1)} pts a game vs an average defense`}
                  >
                    {smash ? "▲" : "▼"} {l.pos} {l.effect > 0 ? "+" : "−"}
                    {Math.abs(l.effect).toFixed(1)}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="hub-foot">▲ smash spot · ▼ tough spot · points a game vs an average defense</p>
    </Card>
  );
}

function GapRow({ p }) {
  const lo = Math.min(p.susFp, p.susXfp);
  const hi = Math.max(p.susFp, p.susXfp);
  const max = Math.max(p.susFp, p.susXfp, 1) * 1.1;
  const hot = p.gap > 0;
  return (
    <li className="hub-gap-row">
      <Nm n={p.n} pos={p.pos} cls="hub-gap-name" />
      <span className="hub-dumbbell" title={`Scoring ${fmt1(p.susFp)} a game vs ${fmt1(p.susXfp)} expected from his opportunity`}>
        <span className="hub-dumbbell-line" style={{ left: `${(lo / max) * 100}%`, width: `${((hi - lo) / max) * 100}%` }} />
        <span className="hub-dumbbell-exp" style={{ left: `${(p.susXfp / max) * 100}%` }} />
        <span className={`hub-dumbbell-act ${hot ? "hot" : "cold"}`} style={{ left: `${(p.susFp / max) * 100}%` }} />
      </span>
      <span className={`hub-mover-delta ${hot ? "up" : "down"}`}>
        {hot ? "+" : "−"}
        {Math.abs(p.gap).toFixed(1)}
      </span>
    </li>
  );
}

function HotCold({ data, pos, limit }) {
  const { hot, cold } = buildHotCold(data.players, { pos, limit });
  if (!hot.length && !cold.length) return null;
  return (
    <Card title="Running hot, running cold" sub="Points per game vs what his opportunity suggests" href="/tools/player-simulations" cta="Season simulations">
      <div className="hub-split">
        <div>
          <h4 className="hub-subhead up">Running hot</h4>
          <ul className="hub-list">{hot.map((p) => <GapRow key={p.n} p={p} />)}</ul>
        </div>
        <div>
          <h4 className="hub-subhead down">Running cold</h4>
          <ul className="hub-list">{cold.map((p) => <GapRow key={p.n} p={p} />)}</ul>
        </div>
      </div>
      <p className="hub-foot">Dot = actual points per game · ring = expected · number = the gap</p>
    </Card>
  );
}

function SimLeaders({ data, pos, limit }) {
  const rows = data.sims.map((s) => ({ ...s, lo: s.floor, mid: s.median, hi: s.ceil }));
  const { list, max } = buildRangeLeaders(rows, { pos, limit, floorKey: "floor", medianKey: "median", ceilKey: "ceil", sortKey: "median" });
  if (!list.length) return null;
  return (
    <Card title="Season outlook leaders" sub="Full-season floor, median and ceiling from 10,000 simulated seasons" href="/tools/player-simulations" cta="All simulations">
      <ul className="hub-list">{list.map((r) => <RangeRow key={r.n} r={r} max={max} highlight="mid" />)}</ul>
      <p className="hub-foot">Bar = floor to ceiling · tick and big number = median · free preview shows the top 10, the full list unlocks with Singularity</p>
    </Card>
  );
}

/* ---------------- dynasty & offseason ---------------- */

const STAGE_COLOR = { Ascending: "var(--up)", Prime: "var(--horizon-gold)", "Decline Watch": "var(--horizon)", "Late Career": "var(--cape)", Veteran: "var(--frost)" };

function StageMap({ data, pos }) {
  const bars = buildStageBars(data.stageCounts, { pos });
  if (!bars.length) return null;
  const legend = [...new Set(bars.flatMap((b) => b.segments.map((s) => s.stage)))];
  return (
    <Card title="Career-stage map" sub="Share of each position's players by career stage (age cutoffs are position-specific)">
      <div className="hub-stage">
        {bars.map((b) => (
          <div key={b.pos} className="hub-stage-row">
            <PosTag pos={b.pos} />
            <span className="hub-stage-bar">
              {b.segments.map((s) => (
                <span
                  key={s.stage}
                  className="hub-stage-seg"
                  style={{ width: `${s.pct}%`, background: STAGE_COLOR[s.stage] }}
                  title={`${s.count} ${b.pos}s · ${s.stage} (${Math.round(s.pct)}%)`}
                />
              ))}
            </span>
            <span className="hub-stage-n">{b.total}</span>
          </div>
        ))}
      </div>
      <ul className="hub-legend">
        {legend.map((st) => (
          <li key={st}>
            <span className="hub-swatch" style={{ background: STAGE_COLOR[st] }} />
            {st}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AgeCurve({ data, pos }) {
  const c = buildAgeCurve(data.players, { pos });
  if (!c) return null;
  const W = 640, H = 280, L = 40, R = 14, T = 12, B = 34;
  const x0 = Math.floor(c.minAge) - 1;
  const x1 = Math.ceil(c.maxAge) + 1;
  const yMax = Math.ceil((c.maxProj * 1.08) / 5) * 5;
  const sx = (a) => L + ((a - x0) / (x1 - x0)) * (W - L - R);
  const sy = (v) => T + (1 - v / yMax) * (H - T - B);
  const xTicks = [];
  for (let a = Math.ceil(x0 / 2) * 2; a <= x1; a += 2) xTicks.push(a);
  const yTicks = [];
  for (let v = 0; v <= yMax; v += 5) yTicks.push(v);
  return (
    <Card title="Age vs production" sub="Top-ranked players by age and median projection this week" wide href="/tools/redraft-rankings" cta="Rankings">
      <svg viewBox={`0 0 ${W} ${H}`} className="hub-scatter" role="img" aria-label="Scatter of player age against median projection">
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="hub-grid" />
            <text x={L - 8} y={sy(v) + 4} textAnchor="end" className="hub-axis">
              {v}
            </text>
          </g>
        ))}
        {xTicks.map((a) => (
          <text key={`x${a}`} x={sx(a)} y={H - 12} textAnchor="middle" className="hub-axis">
            {a}
          </text>
        ))}
        <text x={W / 2} y={H - 0} textAnchor="middle" className="hub-axis hub-axis-title">
          Age
        </text>
        {c.pts.map((p) => (
          <circle key={p.n} cx={sx(p.age)} cy={sy(p.proj)} r="5" className={`hub-dot hub-dot-${p.pos}`}>
            <title>{`${p.n} (${p.pos}, ${p.age}) · ${fmt1(p.proj)} proj`}</title>
          </circle>
        ))}
        {c.trend.length > 1 && <polyline className="hub-trend" points={c.trend.map((t) => `${sx(t.age)},${sy(t.avg)}`).join(" ")} />}
      </svg>
      <ul className="hub-legend">
        {POSITIONS.filter((p) => pos === "ALL" || p === pos).map((p) => (
          <li key={p}>
            <span className={`hub-swatch hub-swatch-${p}`} />
            {p}
          </li>
        ))}
        <li>
          <span className="hub-swatch hub-swatch-trend" />
          Average by age
        </li>
      </ul>
    </Card>
  );
}

function AssetRow({ p }) {
  return (
    <li className="hub-asset">
      <Nm n={p.n} pos={p.pos} cls="hub-asset-name" />
      <span className="hub-asset-meta">
        <TeamBadge team={p.team} />
        <b>{p.age != null ? `age ${p.age}` : ""}</b>
        <i>#{p.rank}</i>
      </span>
    </li>
  );
}

function Assets({ data, pos, limit }) {
  const young = buildStageList(data.players, ["Ascending"], { pos, limit });
  const old = buildStageList(data.players, ["Decline Watch", "Late Career", "Veteran"], { pos, limit });
  if (!young.length && !old.length) return null;
  return (
    <Card title="Dynasty assets on the move" sub="Top-ranked players still ascending, and ones entering decline" wide href="/tools/player-simulations" cta="Role & stage tags">
      <div className="hub-split">
        <div>
          <h4 className="hub-subhead up">Still ascending</h4>
          <ul className="hub-list">{young.map((p) => <AssetRow key={p.n} p={p} />)}</ul>
        </div>
        <div>
          <h4 className="hub-subhead down">Decline watch</h4>
          <ul className="hub-list">{old.map((p) => <AssetRow key={p.n} p={p} />)}</ul>
        </div>
      </div>
    </Card>
  );
}

function RoleMap({ data, pos }) {
  const positions = pos === "ALL" ? POSITIONS : [pos];
  const blocks = positions
    .map((p) => {
      const counts = data.roleCounts?.[p] || {};
      const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const max = Math.max(1, ...rows.map((r) => r[1]));
      return rows.length ? { p, rows, max } : null;
    })
    .filter(Boolean);
  if (!blocks.length) return null;
  return (
    <Card title="Role map" sub="How each position's players split into roles (from usage mix, never volume)" href="/tools/player-simulations" cta="Player roles">
      <div className="hub-roles">
        {blocks.map((b) => (
          <div key={b.p} className="hub-role-block">
            <PosTag pos={b.p} />
            <ul>
              {b.rows.map(([name, n]) => (
                <li key={name}>
                  <span className="hub-role-name">{ARCHETYPE_SHORT[name] || name}</span>
                  <span className="hub-role-bar">
                    <span style={{ width: `${(n / b.max) * 100}%` }} className={`hub-role-fill hub-role-fill-${b.p}`} />
                  </span>
                  <span className="hub-role-n">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Boards({ data, pos, limit }) {
  const prospects = (data.boards?.prospects || []).filter((r) => pos === "ALL" || r.position === pos);
  const draft = (data.boards?.draft || []).filter((r) => pos === "ALL" || r.position === pos);
  if (!prospects.length && !draft.length) return null;
  return (
    <Card title="Rookies and prospects" sub="Prospect rankings and the first round of the rookie draft board" href="/tools/prospect-rankings" cta="Prospect rankings">
      <div className="hub-split">
        {prospects.length > 0 && (
          <div>
            <h4 className="hub-subhead">Prospect board</h4>
            <ul className="hub-list">
              {prospects.slice(0, limit).map((r) => (
                <li key={`${r.position}-${r.rank}`} className="hub-asset">
                  <span className="hub-asset-name">
                    <i className="hub-rank">{r.rank}</i> {r.player_name} <PosTag pos={r.position} />
                  </span>
                  <span className="hub-asset-meta">{r.school || ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {draft.length > 0 && (
          <div>
            <h4 className="hub-subhead">Rookie draft · Round 1</h4>
            <ul className="hub-list">
              {draft.slice(0, limit).map((r) => (
                <li key={`${r.round}-${r.pick}`} className="hub-asset">
                  <span className="hub-asset-name">
                    <i className="hub-rank">{r.pick}</i> {r.player_name} <PosTag pos={r.position} />
                  </span>
                  <span className="hub-asset-meta">{r.team ? <TeamBadge team={r.team} /> : null}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

const MODULES = {
  movers: Movers,
  ceilings: Ceilings,
  matchups: Matchups,
  hotcold: HotCold,
  simLeaders: SimLeaders,
  stageMap: StageMap,
  ageCurve: AgeCurve,
  assets: Assets,
  roleMap: RoleMap,
  boards: Boards,
};

export default function HubClient({ data, config, defaultTab }) {
  const tabs = config.tabs.filter((t) => t.modules.some((m) => m.enabled));
  const [tab, setTab] = useState(tabs.some((t) => t.id === defaultTab) ? defaultTab : tabs[0]?.id);
  const [pos, setPos] = useState("ALL");
  const active = tabs.find((t) => t.id === tab) || tabs[0];
  if (!active) return null;
  const { counts, latest } = data;

  return (
    <section id="hub" className="hub">
      <div className="section-head reveal">
        <div className="eyebrow blue">Live data</div>
        <h2>See what the model sees.</h2>
        <p>Real numbers from this week&apos;s projections and the season simulations, in season and out of it. Pick a view, narrow it by position.</p>
      </div>

      <ul className="hub-stats">
        {latest && (
          <li>
            <b>Week {latest.week}</b>
            <span>{latest.season} season</span>
          </li>
        )}
        <li>
          <b>{counts.ranked || "—"}</b>
          <span>players ranked</span>
        </li>
        <li>
          <b>{counts.simmed || "—"}</b>
          <span>seasons simulated</span>
        </li>
        <li>
          <b>{counts.runs.toLocaleString()}</b>
          <span>runs each</span>
        </li>
      </ul>

      <div className="hub-controls">
        <div className="hub-tabs" role="tablist" aria-label="Choose a view">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={t.id === tab ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="hub-posfilter" role="group" aria-label="Filter by position">
          {["ALL", ...POSITIONS].map((p) => (
            <button key={p} type="button" className={pos === p ? "on" : ""} aria-pressed={pos === p} onClick={() => setPos(p)}>
              {p === "ALL" ? "All" : p}
            </button>
          ))}
        </div>
      </div>
      <p className="hub-blurb">{active.blurb}</p>

      <div className="hub-grid-cards">
        {active.modules
          .filter((m) => m.enabled && MODULES[m.id])
          .map((m) => {
            const Module = MODULES[m.id];
            return <Module key={m.id} data={data} pos={pos} limit={m.limit || 5} />;
          })}
      </div>
    </section>
  );
}
