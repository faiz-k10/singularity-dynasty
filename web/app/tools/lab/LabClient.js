"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PanelTabs from "../../PanelTabs";
import { LAB_METRIC, LAB_METRICS } from "@/lib/labMetrics";
import { PICK_COLORS, MAX_PICKS, Signature } from "./labUi";
import LabPicker from "./LabPicker";
import LabScatter from "./LabScatter";
import LabBoard from "./LabBoard";
import LabGameLog from "./LabGameLog";
import LabCompare from "./LabCompare";
import LabExport from "./LabExport";
import { useMyView, MyPlayersFilter, MyPlayersNote } from "../MyPlayers";

const VIEWS = [
  ["scatter", "Scatter"],
  ["leaders", "Leaderboard"],
  ["games", "Game Log"],
  ["compare", "Compare"],
];
const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];
// Where each view starts when the URL doesn't say: usage against scoring (does the role turn into points?), this week's projection.
const DEFAULT_AXES = { ALL: ["avgXfp", "ppg"], QB: ["u_att_pg", "ppg"], RB: ["u_touches_pg", "ppg"], WR: ["u_tgt_pg", "ppg"], TE: ["u_tgt_pg", "ppg"] };
const DEFAULT_LEADER = "projection";
// A metric is offered for a pool once a few players have it (rate numbers are left out below a volume gate, and some only exist at one position).
const MIN_VALUES = 3;

// The Lab: one panel with four views over the same players -- Scatter (two numbers against each other), Leaderboard (a position ranked on
// one), Game Log (weekly scoring of the picked players) and Compare (the picked players side by side, every number with its percentile).
// Up to five picked players carry their own colour through every view. The whole state lives in the URL, so a chart can be shared.
export default function LabClient({ rows, week, season, simsAccess, mine, gated, initial }) {
  const byName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  const usable = (k) => Boolean(LAB_METRIC[k]) && (LAB_METRIC[k].tier !== "singularity" || simsAccess);

  const [view, setView] = useState(VIEWS.some(([k]) => k === initial.view) ? initial.view : "scatter");
  const [pos, setPos] = useState(POSITIONS.includes(initial.pos) ? initial.pos : "ALL");
  const [x, setX] = useState(usable(initial.x) ? initial.x : null);
  const [y, setY] = useState(usable(initial.y) ? initial.y : null);
  const [lead, setLead] = useState(usable(initial.m) ? initial.m : DEFAULT_LEADER);
  // Picked players with a fixed colour slot each, so removing one never recolours the others.
  const [picks, setPicks] = useState(() => {
    // No "p" in the URL = a fresh visit: start with this week's top two so every view has something to show. An empty "p" = the
    // viewer removed everyone, and a shared link keeps it that way.
    const start =
      initial.p == null
        ? rows.filter((r) => !r.bye).slice(0, 2).map((r) => r.name)
        : String(initial.p)
            .split("|")
            .filter((n) => byName.has(n));
    return [...new Set(start)].slice(0, MAX_PICKS).map((name, slot) => ({ name, slot }));
  });

  // The My players filter (shared with the rankings pages): only players on the viewer's saved teams, optionally one league. The hook reads
  // `player_name`, the Lab's rows say `name`.
  const myRows = useMemo(() => rows.map((r) => ({ player_name: r.name })), [rows]);
  const my = useMyView(mine, myRows);
  const pool = useMemo(
    () => rows.filter((r) => (pos === "ALL" || r.pos === pos) && (!my.on || my.ownedByName.has(r.name))),
    [rows, pos, my.on, my.ownedByName]
  );
  // The metrics this pool has enough values for.
  // A pool smaller than MIN_VALUES (the free top 50 can hold only two TEs) needs every player to have the number, or nothing at all
  // would be offered and both axes would fall back to the same metric.
  const available = useMemo(() => {
    const need = Math.max(1, Math.min(MIN_VALUES, pool.length));
    const set = new Set();
    for (const m of LAB_METRICS) {
      let n = 0;
      for (const r of pool) if (typeof r.m[m.key] === "number" && ++n >= need) break;
      if (n >= need) set.add(m.key);
    }
    return set;
  }, [pool]);
  // A choice the pool can't show (switching QB -> WR with "Pass Att/G" on an axis) falls back to the position's default, without
  // forgetting what was picked: switching back restores it.
  // A fallen-back Y skips the X metric so the scatter never plots a number against itself.
  const fallback = (want, preferred, avoid) =>
    want && available.has(want) ? want : [preferred, "ppg", "projection", ...available].find((k) => available.has(k) && k !== avoid) || "ppg";
  const xKey = fallback(x, DEFAULT_AXES[pos][0]);
  const yKey = fallback(y, DEFAULT_AXES[pos][1], xKey);
  const leadKey = fallback(lead, DEFAULT_LEADER);

  const picked = useMemo(
    () => picks.map((p) => ({ ...byName.get(p.name), color: PICK_COLORS[p.slot] })).filter((p) => p.name),
    [picks, byName]
  );
  const colorOf = useMemo(() => new Map(picked.map((p) => [p.name, p.color])), [picked]);

  const toggle = (name) =>
    setPicks((cur) => {
      if (cur.some((p) => p.name === name)) return cur.filter((p) => p.name !== name);
      if (cur.length >= MAX_PICKS) return cur;
      const used = new Set(cur.map((p) => p.slot));
      const slot = PICK_COLORS.findIndex((_, i) => !used.has(i));
      return [...cur, { name, slot }];
    });

  // Mirror the state into the URL (no navigation), so the page can be bookmarked or shared exactly as it looks.
  useEffect(() => {
    const q = new URLSearchParams({ view, pos, x: xKey, y: yKey, m: leadKey, p: picks.map((p) => p.name).join("|") });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q}`);
  }, [view, pos, xKey, yKey, leadKey, picks]);

  // The exported picture's heading: what the chart shows, for which players, which week.
  const stageRef = useRef(null);
  const title = {
    scatter: `${LAB_METRIC[yKey]?.label} vs ${LAB_METRIC[xKey]?.label}`,
    leaders: `${LAB_METRIC[leadKey]?.label} leaders`,
    games: "Weekly scoring",
    compare: "Side by side",
  }[view];
  const scope = `${pos === "ALL" ? "All positions" : pos} · Week ${week} · ${season}`;
  const fileName = `singularity-lab-${view}-${pos.toLowerCase()}-w${week}`;

  const shared = { pool, available, simsAccess, colorOf, onToggle: toggle, pos };
  return (
    <section className="lab glass-panel" aria-label="The Lab">
      <div className="lab-bar">
        <PanelTabs tabs={VIEWS} value={view} onChange={setView} label="Lab view" />
        <div className="rk-positions" role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <button key={p} type="button" className={pos === p ? "active" : ""} aria-pressed={pos === p} onClick={() => setPos(p)}>
              {p === "ALL" ? "All" : p}
            </button>
          ))}
        </div>
        <MyPlayersFilter mine={mine} view={my} gated={gated} compact />
        <LabExport stageRef={stageRef} fileName={fileName} title={title} caption={`${title} · ${scope}. Charted in The Lab by Singularity Dynasty.`} />
      </div>

      {my.on && <MyPlayersNote mine={mine} view={my} gated={gated} />}
      <LabPicker rows={rows} picked={picked} onToggle={toggle} full={picks.length >= MAX_PICKS} />

      <div className="lab-stage" ref={stageRef}>
        {/* Shown only in an exported picture (.is-exporting): the brand, what the chart is, and the week. */}
        <div className="lab-export-head" aria-hidden="true">
          <span className="lab-export-brand">
            <span className="ring" />
            Singularity Dynasty <i>The Lab</i>
          </span>
          <span className="lab-export-title">{title}</span>
          <span className="lab-export-scope">{scope}</span>
        </div>
        {/* The watermark, also only in an exported picture: a faint wordmark across the chart, plus the brand signature (labUi Signature: on a
            chart's x axis, under the view otherwise), so a shared chart always carries where it came from. */}
        <div className="lab-export-mark" aria-hidden="true">Singularity Dynasty</div>
        {view === "scatter" && (
          <LabScatter {...shared} xKey={xKey} yKey={yKey} onX={setX} onY={setY} onSwap={() => (setX(yKey), setY(xKey))} />
        )}
        {view === "leaders" && <LabBoard {...shared} metric={leadKey} onMetric={setLead} />}
        {view === "games" && <LabGameLog picked={picked} week={week} season={season} />}
        {view === "compare" && <LabCompare picked={picked} simsAccess={simsAccess} onToggle={toggle} />}
        {(view === "leaders" || view === "compare") && <Signature />}
      </div>
    </section>
  );
}
