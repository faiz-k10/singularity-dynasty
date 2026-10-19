"use client";

import { useEffect, useMemo, useState } from "react";
import SlotBadge from "./SlotBadge";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { summarizeSide } from "@/lib/winChance";
import Standings from "./Standings";
import WaiverWire from "./WaiverWire";
import { useMounted } from "./useMounted";

// Sleeper's own page for this week's matchup in a league (opens in a new tab).
export const sleeperMatchupUrl = (leagueId) => (leagueId ? `https://sleeper.com/leagues/${leagueId}/matchup` : null);

const fmt1 = (v) => (v == null ? "—" : v.toFixed(1));

export function formatWin(p) {
  return p == null ? "—" : `${Math.round(p * 100)}%`;
}

// One word for where a matchup stands, from the win chance -- shared by the Sunday board cards and this panel so the
// colour and the headline mean the same thing everywhere (gold = going your way, blue = not, plain = too close).
export function standing(pct, done) {
  if (pct == null) return { key: "none", label: null };
  if (done) return pct >= 0.5 ? { key: "won", label: "Won" } : { key: "lost", label: "Lost" };
  if (pct >= 0.995) return { key: "ahead", label: "Locked in" };
  if (pct <= 0.005) return { key: "behind", label: "Out of reach" };
  if (pct >= 0.6) return { key: "ahead", label: "Favored" };
  if (pct <= 0.4) return { key: "behind", label: "Underdog" };
  return { key: "close", label: "Toss-up" };
}

// "Mon 8:15 PM" for a game not started yet, the clock while it's on, "Final" after.
function gameLabel(p, mounted) {
  const o = p.outlook;
  if (p.out) return "Out";
  if (o.state === "bye") return "Bye";
  if (o.state === "post") return "Final";
  if (o.state === "in") return o.detail || "Live";
  if (o.state === "pre" && o.start && mounted) {
    const d = new Date(o.start);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  }
  return "";
}

function leftLabel(s) {
  if (s.yetToPlay + s.playing === 0) return "All games done";
  const parts = [];
  if (s.yetToPlay) parts.push(`${s.yetToPlay} to play`);
  if (s.playing) parts.push(`${s.playing} playing`);
  return parts.join(" · ");
}

// uncertain: points are on the board but the scoreboard couldn't be read, so we can't tell who is still to play --
// the "to come" range, projected final and players-left counts are hidden rather than guessed.
function SideRow({ p, scoreboardKnown, uncertain, mounted }) {
  if (!p.id) {
    return (
      <div className="h2h-row is-empty">
        <span className="h2h-c-slot"><SlotBadge slot={p.slot} /></span>
        <span className="h2h-c-player h2h-player-name h2h-muted">Empty slot</span>
        <span className="h2h-c-proj mono">—</span>
        <span className="h2h-c-pts mono">—</span>
      </div>
    );
  }
  const o = p.outlook;
  // Before the scoreboard is read (a saved snapshot), fall back to the points Sleeper had on the board.
  const pts = o.pts ?? (!scoreboardKnown && p.pts ? p.pts : null);
  const done = o.state === "post" || o.state === "bye" || p.out;
  const beat = pts != null && p.proj > 0 && pts >= p.proj;
  return (
    <div className={`h2h-row${o.state === "in" ? " is-live" : ""}${done ? " is-done" : ""}`}>
      <span className="h2h-c-slot"><SlotBadge slot={p.slot} /></span>
      <span className="h2h-c-player">
        <span className="h2h-player-name">{p.name}</span>
        <span className="h2h-player-sub">
          <span className="h2h-slot-inline"><SlotBadge slot={p.slot} /></span>
          <PositionBadge position={p.pos} />
          <TeamBadge team={p.team} />
          <span className="h2h-game mono">{gameLabel(p, mounted)}</span>
        </span>
      </span>
      <span
        className={`h2h-c-proj mono${p.est ? " h2h-muted" : ""}`}
        title={[
          p.est ? "Typical score for the position (our model doesn't project this player)" : "Singularity weekly projection",
          done || uncertain || o.hi <= 0 ? null : `Still to come: ${Math.round(o.lo)}–${Math.round(o.hi)} pts (8 in 10 outcomes)`,
        ]
          .filter(Boolean)
          .join("\n")}
      >
        {p.floor != null && p.ceiling != null && p.proj > 0 ? (
          // Stacked like a number line: ceiling on top, the median (our projection) in the middle, floor underneath.
          <span className="h2h-range">
            <span className="h2h-range-hi">{fmt1(p.ceiling)}</span>
            <span className="h2h-range-mid">{fmt1(p.proj)}</span>
            <span className="h2h-range-lo">{fmt1(p.floor)}</span>
          </span>
        ) : (
          fmt1(p.proj)
        )}
      </span>
      <span
        className={`h2h-c-pts mono live-pts-cell${o.state === "in" ? " is-live" : ""}${beat ? " beat" : ""}`}
        title={o.state === "in" ? "In progress" : o.state === "post" ? "Final" : "Not started"}
      >
        {o.state === "in" && <span className="matchup-score-live-dot" aria-hidden="true" />}
        {fmt1(pts)}
      </span>
    </div>
  );
}

function Side({ title, side, opp = false, scoreboardKnown, uncertain, mounted }) {
  return (
    <div className={`h2h-side${opp ? " opp" : ""}`}>
      <div className="h2h-side-title">{title}</div>
      <div className="h2h-row h2h-head" aria-hidden="true">
        <span className="h2h-c-slot">Slot</span>
        <span className="h2h-c-player">Player</span>
        <span className="h2h-c-proj" title="Ceiling, median projection and floor, top to bottom">Proj</span>
        <span className="h2h-c-pts">Pts</span>
      </div>
      {side.players.map((p, i) => (
        <SideRow key={p.id || `empty-${i}`} p={p} scoreboardKnown={scoreboardKnown} uncertain={uncertain} mounted={mounted} />
      ))}
    </div>
  );
}

function TeamScore({ name, record, score, proj, left, opp = false }) {
  return (
    <div className={`h2h-team${opp ? " opp" : ""}`}>
      <div className="h2h-team-name">{name}</div>
      {record && <div className="h2h-team-rec mono">{record}</div>}
      <div className="h2h-score mono">{fmt1(score)}</div>
      <div className="h2h-meta mono">
        {proj != null && <span>Proj {fmt1(proj)}</span>}
        {left && <span>{left}</span>}
      </div>
    </div>
  );
}

// Head-to-head view for one saved league: this week's two lineups slot by slot with live points, our projection, the
// range still to come and each game's status, under a scoreboard with the live score, projected finals, players left
// and the win chance (lib/winChance.js, computed server-side and refreshed by the 30-second poll). The league's
// standings + playoff odds (Standings.js, once a full refresh has gathered them) and the best players still available
// in that league (WaiverWire.js) sit underneath as two tabs.
export default function MatchupPanel({ team, gameStates }) {
  const s = team.settings || {};
  return (
    <div className="h2h-wrap">
      <MatchupBody team={team} gameStates={gameStates} />
      <LeagueTabs team={team} />
    </div>
  );
}

// Under the matchup: Standings (with playoff odds) and Best available as two tabs, so the panel stays short. The
// tab is remembered per browser; Best available only loads (and only asks Sleeper) once its tab is opened. Before a
// full refresh has gathered the standings there is nothing to tab between, so Best available just shows on its own.
function LeagueTabs({ team }) {
  const s = team.settings || {};
  const hasStandings = Boolean(s.season?.standings?.length);
  const [saved, setSaved] = useState("standings");
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const v = localStorage.getItem("myteam.panelTab");
        if (v === "standings" || v === "available") setSaved(v);
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  function pick(v) {
    setSaved(v);
    try {
      localStorage.setItem("myteam.panelTab", v);
    } catch {}
  }
  if (!hasStandings) return <WaiverWire teamId={team.id} />;
  const tab = saved;
  return (
    <div className="h2h-tabs">
      <div className="board-toggle league-dash-tabs" role="tablist" aria-label="Standings or best available">
        {[
          ["standings", "Standings"],
          ["available", "Best available"],
        ].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => pick(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "standings" ? <Standings season={s.season} opponent={s.isBye ? null : s.opponent} bare /> : <WaiverWire teamId={team.id} bare />}
    </div>
  );
}

function MatchupBody({ team, gameStates }) {
  const mounted = useMounted();
  const s = team.settings || {};
  const scoreboardKnown = Boolean(gameStates && Object.keys(gameStates).length);
  const mine = useMemo(() => (s.h2h ? summarizeSide(s.h2h.mine, gameStates) : null), [s.h2h, gameStates]);
  const opp = useMemo(() => (s.h2h ? summarizeSide(s.h2h.opp, gameStates) : null), [s.h2h, gameStates]);
  const url = sleeperMatchupUrl(team.platform_league_id);
  const sleeperLink = url && (
    <a className="h2h-sleeper mono" href={url} target="_blank" rel="noopener noreferrer">
      Open in Sleeper <span aria-hidden="true">↗</span>
    </a>
  );

  if (s.isBye) {
    return <div className="h2h h2h-empty"><p>Bye week: no opponent this week.</p>{sleeperLink}</div>;
  }
  if (!s.opponent) {
    return <div className="h2h h2h-empty"><p>This week&apos;s matchup isn&apos;t posted yet.</p>{sleeperLink}</div>;
  }

  const live = s.matchupActual;
  const myName = team.team_name || "Your team";
  const pct = s.winChance;
  const allDone =
    mine && opp && mine.yetToPlay + mine.playing + opp.yetToPlay + opp.playing === 0 && (mine.pts > 0 || opp.pts > 0);
  const st = standing(s.bestBall ? null : pct, allDone);
  const center = (
    <div className={`h2h-center is-${st.key}`}>
      {st.label && <div className="h2h-word">{st.label}</div>}
      {pct != null && !allDone && pct > 0.005 && pct < 0.995 && <div className="h2h-win-label mono">{formatWin(pct)} to win</div>}
      {pct != null && !allDone && (
        <div className="h2h-win-bar" role="img" aria-label={`${formatWin(pct)} chance to win`}>
          <span style={{ width: `${Math.max(2, pct * 100)}%` }} />
        </div>
      )}
      {sleeperLink}
    </div>
  );

  // Best ball: no set lineup to compare slot by slot, just the totals.
  if (s.bestBall || !mine || !opp) {
    return (
      <div className="h2h">
        <div className="h2h-board">
          <TeamScore name={myName} record={s.record} score={live?.mine ?? null} proj={s.matchupProj?.mine ?? null} />
          {center}
          <TeamScore name={s.opponent} record={s.opponentRecord} score={live?.opp ?? null} proj={s.matchupProj?.opp ?? null} opp />
        </div>
        <p className="h2h-note">
          {s.bestBall
            ? "Best ball: Sleeper starts your top scorers automatically, so there's no lineup to compare slot by slot and no win chance."
            : "Refresh to load both lineups."}
        </p>
      </div>
    );
  }

  // Sleeper's own totals once games start (they include anything our per-player copy can't, e.g. stat corrections).
  const myScore = live ? live.mine : mine.pts;
  const oppScore = live ? live.opp : opp.pts;
  const uncertain = !scoreboardKnown && [...s.h2h.mine, ...s.h2h.opp].some((p) => p.pts);
  return (
    <div className="h2h">
      <div className="h2h-board">
        <TeamScore name={myName} record={s.record} score={myScore} proj={uncertain ? null : myScore + mine.projFinal - mine.pts} left={uncertain ? null : leftLabel(mine)} />
        {center}
        <TeamScore name={s.opponent} record={s.opponentRecord} score={oppScore} proj={uncertain ? null : oppScore + opp.projFinal - opp.pts} left={uncertain ? null : leftLabel(opp)} opp />
      </div>
      <div className="h2h-lineups">
        <Side title={myName} side={mine} scoreboardKnown={scoreboardKnown} uncertain={uncertain} mounted={mounted} />
        <Side title={s.opponent} side={opp} opp scoreboardKnown={scoreboardKnown} uncertain={uncertain} mounted={mounted} />
      </div>
      <p
        className="h2h-note"
        title="Points already scored are locked in; each starter still to play is simulated 5,000 times from his weekly projection, floor and ceiling (scaled to the time left in a live game). Projected final = points so far + the typical amount still to come."
      >
        Updates every 30 seconds. Hover a projection to see the range still to come.
      </p>
    </div>
  );
}
