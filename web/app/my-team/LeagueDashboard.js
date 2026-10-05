"use client";

import { Fragment, useMemo, useState } from "react";

function parseRecord(rec) {
  const [w = 0, l = 0, t = 0] = String(rec || "0-0").split("-").map(Number);
  return { w, l, t, games: w + l + t, pct: w + l + t ? (w + t / 2) / (w + l + t) : 0 };
}

// One row per saved team: the at-a-glance view Sleeper makes you click
// league-by-league to assemble.
function buildRow(t) {
  const s = t.settings || {};
  const players = t.players || [];
  const proj = s.matchupProj;
  const live = s.matchupActual;
  const rec = parseRecord(s.record);
  const starters = players.filter((p) => p.isStarter);
  // Our model zeroes players it projects OUT -- a starter at exactly 0
  // is a lineup hole to fix before kickoff.
  const outStarters = s.bestBall ? [] : starters.filter((p) => p.myProjPts === 0);
  return {
    id: t.id,
    team: t.team_name || "Untitled Team",
    league: t.league_name,
    record: s.record || "—",
    recPct: rec.pct,
    opponent: s.isBye ? "BYE" : s.opponent || "—",
    projMine: proj?.mine ?? null,
    projOpp: proj?.opp ?? null,
    liveMine: live?.mine ?? null,
    liveOpp: live?.opp ?? null,
    liveMargin: live ? live.mine - live.opp : null,
    outStarters,
    bestBall: !!s.bestBall,
  };
}

const COLS = [
  { key: "team", label: "Team", sort: (r) => r.team.toLowerCase() },
  { key: "recPct", label: "Record", sort: (r) => r.recPct },
  { key: "opponent", label: "Opponent", sort: (r) => r.opponent.toLowerCase() },
  { key: "projMine", label: "Proj", sort: (r) => r.projMine ?? -1 },
  { key: "liveMargin", label: "Live", sort: (r) => r.liveMargin ?? -999 },
  { key: "alerts", label: "Alerts", sort: (r) => r.outStarters.length },
];

// The main saved-teams view: one sortable row per league, click a row to
// expand its roster and league settings (renderExpanded, supplied by
// MyTeamClient since those pieces live there). Default sort floats leagues
// with lineup alerts to the top.
export default function LeagueDashboard({ savedTeams, renderExpanded }) {
  const [sortKey, setSortKey] = useState("alerts");
  const [dir, setDir] = useState("desc");
  const [open, setOpen] = useState(() => new Set());

  const rows = useMemo(() => {
    const built = savedTeams.map((t) => ({ ...buildRow(t), team_obj: t }));
    const col = COLS.find((c) => c.key === sortKey) || COLS[0];
    const mult = dir === "asc" ? 1 : -1;
    return built.sort((a, b) => {
      const x = col.sort(a);
      const y = col.sort(b);
      return (x > y ? 1 : x < y ? -1 : 0) * mult;
    });
  }, [savedTeams, sortKey, dir]);

  const totals = useMemo(() => {
    let winning = 0;
    let losing = 0;
    let projTotal = 0;
    let alerts = 0;
    for (const r of rows) {
      if (r.liveMargin != null) r.liveMargin >= 0 ? winning++ : losing++;
      else if (r.projMine != null && r.projOpp != null) r.projMine >= r.projOpp ? winning++ : losing++;
      if (r.projMine != null) projTotal += r.projMine;
      alerts += r.outStarters.length;
    }
    return { winning, losing, projTotal, alerts };
  }, [rows]);

  function clickSort(key) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("desc");
    }
  }

  function toggle(id) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="league-dash glass-panel">
      <div className="league-dash-summary">
        <div><strong>{rows.length}</strong> {rows.length === 1 ? "league" : "leagues"}</div>
        <div className="up"><strong>{totals.winning}</strong> leading</div>
        <div className="down"><strong>{totals.losing}</strong> trailing</div>
        <div><strong>{totals.projTotal.toFixed(1)}</strong> total proj pts</div>
        <div className={totals.alerts ? "down" : ""}><strong>{totals.alerts}</strong> lineup alerts</div>
      </div>
      <div className="rankings-table-wrap">
        <table className="rankings-table league-dash-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} onClick={() => clickSort(c.key)} style={{ cursor: "pointer" }}>
                  {c.label}
                  {sortKey === c.key ? (dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
              <tr className="league-dash-row" onClick={() => toggle(r.id)}>
                <td>
                  <span className="my-team-chevron">{open.has(r.id) ? "▾" : "▸"}</span>
                  <div className="league-dash-team">{r.team}</div>
                  <div className="league-dash-league">{r.league}</div>
                </td>
                <td>{r.record}</td>
                <td>{r.opponent}</td>
                <td>
                  {r.projMine != null ? (
                    <span>
                      <span className={r.projMine >= r.projOpp ? "up" : "down"}>{r.projMine.toFixed(1)}</span>
                      {" – "}
                      {r.projOpp.toFixed(1)}
                    </span>
                  ) : "—"}
                </td>
                <td>
                  {r.liveMine != null ? (
                    <span className={r.liveMargin >= 0 ? "up" : "down"}>
                      {r.liveMine.toFixed(1)} – {r.liveOpp.toFixed(1)}
                    </span>
                  ) : "—"}
                </td>
                <td>
                  {r.outStarters.length ? (
                    <span className="down" title={r.outStarters.map((p) => p.name).join(", ")}>
                      {r.outStarters.length} OUT: {r.outStarters.map((p) => p.name).join(", ")}
                    </span>
                  ) : r.bestBall ? (
                    <span className="league-dash-muted">Best ball</span>
                  ) : (
                    <span className="league-dash-muted">None</span>
                  )}
                </td>
              </tr>
              {open.has(r.id) && (
                <tr className="league-dash-expanded">
                  <td colSpan={COLS.length}>{renderExpanded(r.team_obj)}</td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
