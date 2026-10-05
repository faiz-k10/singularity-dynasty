"use client";

import { Fragment, useMemo, useState } from "react";

// "Rico Dowdle" -> "R. Dowdle" (first initial, full remaining name incl. suffixes).
function shortName(name) {
  const [first, ...rest] = String(name || "").trim().split(/\s+/);
  return rest.length ? `${first[0]}. ${rest.join(" ")}` : first;
}

function parseRecord(rec) {
  const [w = 0, l = 0, t = 0] = String(rec || "0-0").split("-").map(Number);
  return { w, l, t, games: w + l + t, pct: w + l + t ? (w + t / 2) / (w + l + t) : 0 };
}

// One row per saved team: the at-a-glance view Sleeper makes you click
// league-by-league to assemble.
function buildRow(t, injuries) {
  const s = t.settings || {};
  const proj = s.matchupProj;
  const live = s.matchupActual;
  const rec = parseRecord(s.record);
  // Our model zeroes players it projects OUT -- a starter at exactly 0
  // is a lineup hole to fix before kickoff.
  // Alerts: starters carrying an injury designation (Questionable /
  // Doubtful / Out / IR) per the live feed -- computed server-side in
  // getRosterNews, which only flags players in the starting lineup.
  const flagged = new Map();
  if (!s.bestBall) for (const i of injuries || []) {
    const prev = flagged.get(i.name);
    if (!prev || i.severity > prev.severity) flagged.set(i.name, i);
  }
  const outStarters = [...flagged.values()].sort((a, b) => b.severity - a.severity);
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

// Headline counts for the Saved Teams panel header: leagues, how many are
// leading / trailing (live score once games start, else projection) and
// total lineup alerts. Same rows the table renders, so they always agree.
export function summarizeLeagues(savedTeams, injuriesByTeam) {
  let leading = 0;
  let trailing = 0;
  let alerts = 0;
  for (const t of savedTeams) {
    const r = buildRow(t, injuriesByTeam?.[t.id]);
    if (r.liveMargin != null) r.liveMargin >= 0 ? leading++ : trailing++;
    else if (r.projMine != null && r.projOpp != null) r.projMine >= r.projOpp ? leading++ : trailing++;
    alerts += r.outStarters.length;
  }
  return { leagues: savedTeams.length, leading, trailing, alerts };
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
export default function LeagueDashboard({ savedTeams, renderExpanded, injuriesByTeam, refreshing = false }) {
  const [sortKey, setSortKey] = useState("alerts");
  const [dir, setDir] = useState("desc");
  const [open, setOpen] = useState(() => new Set());

  const rows = useMemo(() => {
    const built = savedTeams.map((t) => ({ ...buildRow(t, injuriesByTeam?.[t.id]), team_obj: t }));
    const col = COLS.find((c) => c.key === sortKey) || COLS[0];
    const mult = dir === "asc" ? 1 : -1;
    return built.sort((a, b) => {
      const x = col.sort(a);
      const y = col.sort(b);
      return (x > y ? 1 : x < y ? -1 : 0) * mult;
    });
  }, [savedTeams, injuriesByTeam, sortKey, dir]);

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
    <div className="league-dash glass-panel" aria-busy={refreshing}>
      {refreshing && (
        <div className="league-dash-overlay" role="status">
          <span className="league-dash-spinner" aria-hidden="true" />
          <span>Refreshing live data…</span>
        </div>
      )}
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
                    <div className="league-dash-alerts">
                      {r.outStarters.map((p) => (
                        <span key={p.name} className="down">{shortName(p.name)} ({p.status})</span>
                      ))}
                    </div>
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
