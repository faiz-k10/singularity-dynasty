"use client";

import { useEffect, useMemo, useState } from "react";
import MatchupPanel, { sleeperMatchupUrl, formatWin } from "./MatchupPanel";
import { buildRow } from "./LeagueDashboard";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { summarizeSide } from "@/lib/winChance";
import { buildLiveFeed, trackScoring, sortFeed } from "@/lib/liveFeed";

const fmt1 = (v) => (v == null ? "—" : v.toFixed(1));

function leftText(side) {
  if (!side) return null;
  const n = side.yetToPlay + side.playing;
  if (!n) return "done";
  return side.playing ? `${n} left · ${side.playing} on` : `${n} left`;
}

// One league at a glance: both scores, win chance, players left per side, lineup alerts, Open in Sleeper.
function LeagueCard({ team, gameStates, injuries, onOpen }) {
  const s = team.settings || {};
  const row = buildRow(team, injuries);
  const mine = useMemo(() => (s.h2h ? summarizeSide(s.h2h.mine, gameStates) : null), [s.h2h, gameStates]);
  const opp = useMemo(() => (s.h2h ? summarizeSide(s.h2h.opp, gameStates) : null), [s.h2h, gameStates]);
  const live = s.matchupActual;
  const myScore = live ? live.mine : mine?.pts ?? null;
  const oppScore = live ? live.opp : opp?.pts ?? null;
  const pct = row.winPct;
  const anyLive = (mine?.playing || 0) + (opp?.playing || 0) > 0;
  const tone = pct == null ? "" : pct >= 0.5 ? " is-ahead" : " is-behind";
  const url = sleeperMatchupUrl(team.platform_league_id);
  const alerts = row.outStarters.length;
  return (
    <div
      className={`sb-card${tone}`}
      role="button"
      tabIndex={0}
      data-league-id={team.id}
      onClick={() => onOpen(team.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(team.id);
        }
      }}
      aria-label={`${row.league}: open the matchup`}
    >
      <div className="sb-card-head">
        <span className="sb-card-league">{row.league}</span>
        {anyLive && <span className="matchup-score-live-dot" title="Games in progress" aria-hidden="true" />}
        {url && (
          <a
            className="league-dash-sleeper sb-card-sleeper"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open this matchup in Sleeper"
            aria-label={`Open ${row.league} in Sleeper`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M9 2h5v5M14 2 7.5 8.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
      </div>
      {s.isBye ? (
        <div className="sb-card-bye">Bye week</div>
      ) : !s.opponent ? (
        <div className="sb-card-bye">Matchup not posted yet</div>
      ) : (
        <>
          <div className="sb-card-side">
            <span className="sb-card-team">{row.team}</span>
            <span className="sb-card-left mono">{leftText(mine)}</span>
            <span className={`sb-card-score mono${myScore != null && oppScore != null && myScore >= oppScore ? " lead" : ""}`}>{fmt1(myScore)}</span>
          </div>
          <div className="sb-card-side">
            <span className="sb-card-team sb-muted">{row.opponent}</span>
            <span className="sb-card-left mono">{leftText(opp)}</span>
            <span className={`sb-card-score mono${myScore != null && oppScore != null && oppScore > myScore ? " lead" : ""}`}>{fmt1(oppScore)}</span>
          </div>
          <div className="sb-card-foot">
            <span className={`sb-card-win mono${pct == null ? "" : pct >= 0.5 ? " up" : " down"}`}>{formatWin(pct)}</span>
            <span className="sb-card-winbar" aria-hidden="true">
              {pct != null && <span style={{ width: `${pct * 100}%` }} />}
            </span>
            {alerts > 0 ? (
              <span className="sb-card-alerts mono" title={row.outStarters.map((p) => `${p.name}: ${p.status}`).join("\n")}>
                <span className={`status-dot status-dot-${row.outStarters[0].severity}`} aria-hidden="true" />
                {alerts} {alerts === 1 ? "alert" : "alerts"}
              </span>
            ) : s.bestBall ? (
              <span className="sb-card-alerts mono sb-muted">Best ball</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

// "My players live": every starter of yours whose game is on or over, across all leagues, newest scoring first.
function LiveFeed({ savedTeams, gameStates, updatedAt }) {
  const feed = useMemo(() => buildLiveFeed(savedTeams, gameStates), [savedTeams, gameStates]);
  const key = feed.rows.map((r) => `${r.id}:${r.pts}`).join(",");
  // Points history across polls (React's "adjust state while rendering" pattern: only runs when the points change).
  const [track, setTrack] = useState({ key: null, t: null, stamp: 0 });
  if (track.key !== key) {
    const stamp = updatedAt || track.stamp + 1;
    setTrack({ key, t: trackScoring(track.t, feed.rows, stamp), stamp });
  }
  const t = track.t || { changedAt: {}, delta: {} };
  const rows = sortFeed(feed.rows, t.changedAt);
  return (
    <aside className="sb-feed glass-panel" aria-label="My players live">
      <div className="sb-feed-head">
        <h2 className="board-panel-title">My players live</h2>
        <span className="sb-feed-total mono" title="Each start counts once per league, in that league's scoring">
          <strong>{fmt1(feed.points)}</strong> pts · {feed.starts} {feed.starts === 1 ? "start" : "starts"}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="sb-muted sb-feed-empty">
          {gameStates ? "None of your starters has kicked off yet." : "Waiting for the live scoreboard…"}
        </p>
      ) : (
        <ol className="sb-feed-list">
          {rows.map((r) => {
            const isNew = t.changedAt[r.id] && t.changedAt[r.id] === track.stamp;
            const beat = r.proj > 0 && r.pts >= r.proj;
            return (
              <li key={r.id} className={`sb-feed-row${r.state === "in" ? " is-live" : " is-final"}${isNew ? " is-new" : ""}`}>
                <div className="sb-feed-who">
                  <span className="sb-feed-name">{r.name}</span>
                  <span className="sb-feed-sub">
                    <PositionBadge position={r.pos} />
                    <TeamBadge team={r.team} />
                    <span className="h2h-game mono">{r.state === "in" ? r.detail || "Live" : "Final"}</span>
                  </span>
                  <span className="sb-feed-leagues" title={r.starts.map((x) => `${x.league}: ${x.pts.toFixed(1)}`).join("\n")}>
                    {r.starts.length > 1 && <span className="sb-feed-mult mono">×{r.starts.length}</span>}
                    {r.starts.map((x) => x.league).join(" · ")}
                  </span>
                </div>
                <div className="sb-feed-nums">
                  <span className={`sb-feed-pts mono live-pts-cell${r.state === "in" ? " is-live" : ""}${beat ? " beat" : ""}`}>
                    {r.state === "in" && <span className="matchup-score-live-dot" aria-hidden="true" />}
                    {r.pts === r.ptsMin ? fmt1(r.pts) : `${fmt1(r.ptsMin)}–${fmt1(r.pts)}`}
                  </span>
                  {isNew && t.delta[r.id] > 0 && <span className="sb-feed-delta mono">+{fmt1(t.delta[r.id])}</span>}
                  <span className="sb-feed-proj mono">proj {fmt1(r.proj)}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

// The full-screen game-day layout (My Team's theater, default on game days): a card per league and one running list
// of your players' scoring. Clicking a card opens that league's head-to-head matchup in a drawer.
export default function SundayBoard({ savedTeams, gameStates, injuriesByTeam, updatedAt, toolbar }) {
  const [openId, setOpenId] = useState(null);
  const openTeam = openId ? savedTeams.find((t) => t.id === openId) : null;

  // Esc closes the drawer first (capture phase, so the theater's own Esc handler doesn't also fire).
  useEffect(() => {
    if (!openId) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpenId(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openId]);

  let ahead = 0;
  let behind = 0;
  let alerts = 0;
  for (const t of savedTeams) {
    const r = buildRow(t, injuriesByTeam?.[t.id]);
    if (r.winPct != null) r.winPct >= 0.5 ? ahead++ : behind++;
    alerts += r.outStarters.length;
  }
  const week = savedTeams.find((t) => t.settings?.week)?.settings.week;
  const time = updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : null;

  return (
    <div className="sb">
      <div className="sb-top">
        <h2 className="sb-title">Sunday board{week ? <span className="sb-week mono"> · Week {week}</span> : null}</h2>
        <div className="sb-stats mono">
          <span><strong>{savedTeams.length}</strong> leagues</span>
          <span className="up"><strong>{ahead}</strong> favored</span>
          <span className="down"><strong>{behind}</strong> underdog</span>
          <span className={alerts ? "down" : ""}><strong>{alerts}</strong> alerts</span>
          {time && <span className="sb-muted">Updated {time}</span>}
        </div>
        <span className="board-dock-spacer" />
        {toolbar}
      </div>
      <div className="sb-body">
        <div className="sb-grid">
          {savedTeams.map((t) => (
            <LeagueCard key={t.id} team={t} gameStates={gameStates} injuries={injuriesByTeam?.[t.id]} onOpen={setOpenId} />
          ))}
        </div>
        <LiveFeed savedTeams={savedTeams} gameStates={gameStates} updatedAt={updatedAt} />
      </div>
      {openTeam && (
        <div className="sb-drawer-backdrop" onClick={() => setOpenId(null)}>
          <div className="sb-drawer glass-panel" role="dialog" aria-modal="true" aria-label={`${openTeam.league_name} matchup`} onClick={(e) => e.stopPropagation()}>
            <div className="sb-drawer-head">
              <h2 className="board-panel-title">{openTeam.league_name}</h2>
              <button type="button" className="board-collapse" onClick={() => setOpenId(null)} aria-label="Close matchup" title="Close (Esc)">
                ✕
              </button>
            </div>
            <MatchupPanel team={openTeam} gameStates={gameStates} />
          </div>
        </div>
      )}
    </div>
  );
}
