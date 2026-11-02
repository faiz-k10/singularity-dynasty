"use client";

import { formatWin } from "@/lib/standing";
import { useLayoutEffect, useMemo, useRef } from "react";
import SlotBadge from "./SlotBadge";
import PositionBadge from "../tools/PositionBadge";
import { fmt1, fmt2 } from "@/lib/format";
import TeamBadge from "../tools/TeamBadge";
import Standings from "./Standings";
import WaiverWire from "./WaiverWire";
import LineupAdvice from "./LineupAdvice";
import { useStatsSlide, StatsPanel } from "./GameStats";
import ScoreCurve from "./ScoreCurve";
import { leadState } from "@/lib/leadState";
import { matchupState } from "@/lib/matchupState";
import { summarizeSide } from "@/lib/winChance";
import { benchFromRoster } from "@/lib/h2hBench";
import { applyPendingToLineup } from "@/lib/liveFeed";
import { useMounted } from "./useMounted";

// Sleeper's own page for this week's matchup in a league (opens in a new tab).
export const sleeperMatchupUrl = (leagueId) => (leagueId ? `https://sleeper.com/leagues/${leagueId}/matchup` : null);



// The status colour class (mint | red | grey, from standing().tone) on a card or the scoreboard: the word, its bar and the card edge follow it.
export const toneClass = (st) => (st?.tone ? ` is-tone-${st.tone}` : "");

// "Mon 8:15 PM" for a game not started yet, the clock while it's on, "Final" after.
function gameLabel(p, mounted) {
  const o = p.outlook;
  if (p.out) return "Out";
  if (o.state === "bye") return "BYE";
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

function SideRow({ p, scoreboardKnown, mounted, bench = false }) {
  // Hooks first (the empty-slot return below can't come before them): clicking his score slides his stats for this game in.
  const slide = useStatsSlide(p, p.outlook?.state === "in" || p.outlook?.state === "post");
  if (!p.id) {
    return (
      <div className="h2h-row is-empty">
        <span className="h2h-c-slot"><SlotBadge slot={p.slot} compact /></span>
        <span className="h2h-c-player h2h-player-name h2h-muted">Empty slot</span>
        <span className="h2h-c-curve mono h2h-curve-text">—</span>
        <span className="h2h-c-pts mono">—</span>
      </div>
    );
  }
  const o = p.outlook;
  // Before the scoreboard is read (a saved snapshot), fall back to the points Sleeper had on the board.
  const pts = o.pts ?? (!scoreboardKnown && p.pts ? p.pts : null);
  const done = o.state === "post" || o.state === "bye" || p.out;
  // Same reading as the curve, by the zone the score sits in: mint at or under his floor, red at or over his ceiling, plain
  // anywhere in his normal range (median included).
  const tone = pts == null || o.state === "pre" || typeof p.floor !== "number" || typeof p.ceiling !== "number" ? null : pts <= p.floor ? "low" : pts >= p.ceiling ? "good" : "mid";
  const showCurve = !p.out && o.state !== "bye" && p.proj > 0 && typeof p.floor === "number" && typeof p.ceiling === "number" && p.ceiling > p.floor;
  return (
    <div className={`h2h-row${o.state === "in" ? " is-live" : ""}${done ? " is-done" : ""}${o.state === "pre" && !p.out && !bench ? " is-upcoming" : ""}${bench ? " is-bench" : ""}${slide.phase === "open" ? " is-stats" : slide.phase === "closing" ? " is-closing" : ""}`} style={slide.rowStyle}>
      <span className="h2h-c-slot"><SlotBadge slot={p.slot} compact /></span>
      <span className="h2h-c-player">
        <span className="h2h-player-name">{p.name}</span>
        <span className="h2h-player-sub">
          <span className="h2h-slot-inline"><SlotBadge slot={p.slot} compact /></span>
          <PositionBadge position={p.pos} />
          <TeamBadge team={p.team} />
          <span className="h2h-game mono">{gameLabel(p, mounted)}</span>
        </span>
      </span>
      <span
        className="h2h-c-curve"
      >
        {showCurve ? (
          <ScoreCurve floor={p.floor} median={p.proj} ceiling={p.ceiling} pts={pts} state={o.state} est={p.est} />
        ) : (
          // Nothing to draw a range from (out, or no floor / ceiling): just the median. A bye, or a median of 0, shows nothing (its "0.0" was noise).
          o.state !== "bye" && (p.out || p.proj > 0) && <span className="h2h-curve-text mono">{p.out ? "Out" : fmt1(p.proj)}</span>
        )}
      </span>
      <span
        className={`h2h-c-pts mono live-pts-cell${o.state === "in" ? " is-live" : ""}${tone ? ` tone-${tone}` : ""}${slide.enabled ? " is-clickable" : ""}`}
        {...(slide.enabled ? { role: "button", tabIndex: 0, "aria-expanded": slide.open, onClick: slide.toggle, onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), slide.toggle(e)) } : {})}
      >
        <span className="h2h-pts-num">
          {o.state === "in" && <span className="matchup-score-live-dot" aria-hidden="true" />}
          {fmt2(pts)}
        </span>
      </span>
      <StatsPanel p={p} slide={slide} />
    </div>
  );
}

function Side({ side, bench = [], opp = false, scoreboardKnown, mounted }) {
  return (
    <div className={`h2h-side${opp ? " opp" : ""}`}>
      <div className="h2h-row h2h-head" aria-hidden="true">
        <span className="h2h-c-slot">Slot</span>
        <span className="h2h-c-player">Player</span>
        <span className="h2h-c-curve">Floor · median · ceiling</span>
        <span className="h2h-c-pts">Pts</span>
      </div>
      {side.players.map((p, i) => (
        <SideRow key={p.id || `empty-${i}`} p={p} scoreboardKnown={scoreboardKnown} mounted={mounted} />
      ))}
      {bench.length > 0 && (
        // The bench: under its own heading and tint, never part of the totals.
        <div className="h2h-bench" role="group" aria-label="Bench">
          <div className="h2h-bench-head mono">
            Bench <span>{bench.length}</span>
          </div>
          {bench.map((p) => (
            <SideRow key={p.id} p={p} bench scoreboardKnown={scoreboardKnown} mounted={mounted} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamScore({ name, record, score, proj, left, state = null, opp = false }) {
  return (
    <div className={`h2h-team${opp ? " opp" : ""}`}>
      <div className="h2h-team-name">{name}</div>
      {record && <div className="h2h-team-rec mono">{record}</div>}
      <div className={`h2h-score mono${state ? ` is-${state}` : ""}`}>{fmt2(score)}</div>
      <div className="h2h-meta mono">
        {proj != null && <span>Proj {fmt1(proj)}</span>}
        {left && <span>{left}</span>}
      </div>
    </div>
  );
}

// The views a league opens on, as tabs: Matchup (this week's scoreboard + both lineups), Lineup (the optimizer), Standings (with playoff odds,
// once a full refresh has gathered them) and Best available. The switch itself (PanelTabs) lives in the header of
// whoever hosts the panel: the Sunday board's drawer, and the dashboard's opened row (which adds Roster).
export const hasStandings = (team) => Boolean(team?.settings?.season?.standings?.length);
// alerts: the league's lineup-alert count (row.alertCount.total, the one number made by lineupAlertCount) -- the Lineup Alerts tab gets an inner border while it is above 0.
export function leagueTabs(team, alerts = 0) {
  const lineup = !team?.settings?.isBye && team?.settings?.slots?.length ? [["lineup", "Lineup Alerts", alerts]] : [];
  return [["matchup", "Matchup"], ...lineup, ["available", "Best Available"], ...(hasStandings(team) ? [["standings", "Standings"]] : [])];
}

// Head-to-head view for one saved league: this week's two lineups slot by slot with live points, our projection, the
// range still to come and each game's status, under a scoreboard with the live score, projected finals, players left
// and the win chance (lib/winChance.js, computed server-side and refreshed by the 30-second poll). `tab` picks the
// view: "matchup" (default), "standings" (Standings.js) or "available" (WaiverWire.js -- it only loads, and only asks
// Sleeper, once its tab is opened).
export default function MatchupPanel({ team, gameStates, tab = "matchup", playTotals = null, injuries = [] }) {
  const s = team.settings || {};
  return (
    <div className="h2h-wrap">
      {tab === "standings" && hasStandings(team) ? (
        <Standings season={s.season} opponent={s.isBye ? null : s.opponent} bare />
      ) : tab === "lineup" ? (
        <LineupAdvice team={team} gameStates={gameStates} injuries={injuries} />
      ) : tab === "available" ? (
        <WaiverWire teamId={team.id} bare />
      ) : (
        <MatchupBody team={team} gameStates={gameStates} playTotals={playTotals} />
      )}
    </div>
  );
}

function MatchupBody({ team, gameStates, playTotals }) {
  const mounted = useMounted();
  const s = team.settings || {};
  const scoreboardKnown = Boolean(gameStates && Object.keys(gameStates).length);
  // Sleeper trails the game by a minute or two, so plays it hasn't posted yet are added to each player's points, to the team totals
  // and to the win chance when the play-by-play knows them -- the same numbers (lib/matchupState.js) as the cards and the live list.
  const { mine, opp, live, pct, done: allDone, lock, st } = useMemo(() => matchupState(team.settings || {}, gameStates, playTotals), [team.settings, gameStates, playTotals]);
  // The benches under the starters: from the saved head-to-head (both sides), or -- for a snapshot from before benches were saved -- my own from the
  // saved roster. Each row gets its game state like a starter (summarizeSide); none of it enters the totals above.
  // The plays Sleeper hasn't posted yet are added to a bench player's points exactly as to a starter's (the board requests their plays too).
  const benchMine = useMemo(
    () => summarizeSide(applyPendingToLineup(s.h2h?.mineBench || benchFromRoster(team.players, s.playerPoints), playTotals, s.scoringSettings).list, gameStates).players,
    [s.h2h, s.playerPoints, s.scoringSettings, team.players, gameStates, playTotals],
  );
  const benchOpp = useMemo(
    () => summarizeSide(applyPendingToLineup(s.h2h?.oppBench || [], playTotals, s.scoringSettings).list, gameStates).players,
    [s.h2h, s.scoringSettings, gameStates, playTotals],
  );
  const lineupsRef = useRef(null);
  // Every row's info column (badges + game time) takes the width of the widest one, so the outcome curve beside it is the same size in every row
  // (otherwise "Sun 4:05 PM" under the badges squeezed an unplayed player's curve while "Final" left a finished player's wide). Measured after each render;
  // the variable is cleared first so a shorter label can shrink the column again.
  // Each info block is sized to its content (width:max-content in the CSS), so its box is the width it needs.
  const measureInfo = () => {
    const el = lineupsRef.current;
    if (!el) return;
    el.style.removeProperty("--info-w");
    let widest = 0;
    for (const sub of el.querySelectorAll(".h2h-row:not(.h2h-head) .h2h-player-sub")) widest = Math.max(widest, sub.getBoundingClientRect().width);
    if (widest) el.style.setProperty("--info-w", `${Math.ceil(widest)}px`);
  };
  const measureRef = useRef(measureInfo);
  useLayoutEffect(() => {
    measureRef.current = measureInfo;
    measureInfo();
  });
  // ...and again whenever the panel changes width (window resize, the right-hand pane folding, a drawer finishing its slide).
  useLayoutEffect(() => {
    const el = lineupsRef.current;
    if (!el) return undefined;
    let lastWidth = el.getBoundingClientRect().width;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (Math.abs(w - lastWidth) < 1) return;
      lastWidth = w;
      measureRef.current();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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

  const myName = team.team_name || "Your team";
  const center = (
    <div className={`h2h-center${toneClass(st)}`}>
      {st.label && <div className="h2h-word">{st.label}</div>}
      {pct != null && !allDone && !lock && <div className="h2h-win-label mono">{formatWin(pct)} to win</div>}
      {pct != null && !allDone && (
        <div className="h2h-win-bar" role="img" aria-label={`${formatWin(pct)} chance to win`}>
          <span style={{ width: `${Math.max(2, pct * 100)}%` }} />
        </div>
      )}
      {sleeperLink}
    </div>
  );

  // No lineups to compare slot by slot yet (a snapshot from before they were saved): just the totals.
  if (!mine || !opp) {
    return (
      <div className="h2h">
        <div className="h2h-board">
          <TeamScore state={leadState(live?.mine, live?.opp)[0]} name={myName} record={s.record} score={live?.mine ?? null} proj={s.matchupProj?.mine ?? null} />
          {center}
          <TeamScore state={leadState(live?.mine, live?.opp)[1]} name={s.opponent} record={s.opponentRecord} score={live?.opp ?? null} proj={s.matchupProj?.opp ?? null} opp />
        </div>
        <p className="h2h-note">Refresh to load both lineups.</p>
      </div>
    );
  }

  // Sleeper's own totals once games start (they include anything our per-player copy can't, e.g. stat corrections).
  const myScore = live ? live.mine : mine.pts;
  const oppScore = live ? live.opp : opp.pts;
  // uncertain: points are on the board but the scoreboard couldn't be read, so we can't tell who is still to play --
  // the "to come" range, projected final and players-left counts are hidden rather than guessed.
  const uncertain = !scoreboardKnown && [...s.h2h.mine, ...s.h2h.opp].some((p) => p.pts);
  return (
    <div className="h2h">
      <div className="h2h-board">
        <TeamScore state={leadState(myScore, oppScore)[0]} name={myName} record={s.record} score={myScore} proj={uncertain ? null : myScore + mine.projFinal - mine.pts} left={uncertain ? null : leftLabel(mine)} />
        {center}
        <TeamScore state={leadState(myScore, oppScore)[1]} name={s.opponent} record={s.opponentRecord} score={oppScore} proj={uncertain ? null : oppScore + opp.projFinal - opp.pts} left={uncertain ? null : leftLabel(opp)} opp />
      </div>
      <div className="h2h-lineups" ref={lineupsRef}>
        <Side side={mine} bench={benchMine} scoreboardKnown={scoreboardKnown} mounted={mounted} />
        <Side side={opp} bench={benchOpp} opp scoreboardKnown={scoreboardKnown} mounted={mounted} />
      </div>
      <ul className="h2h-legend" aria-label="How to read the curves">
        <li>
          <span className="h2h-legend-swatch is-low" aria-hidden="true" />
          <span><strong>Floor</strong> a bad game: mint zone</span>
        </li>
        <li>
          <span className="h2h-legend-swatch is-mid" aria-hidden="true" />
          <span><strong>Median</strong> his most likely score; 8 in 10 games land on the steel</span>
        </li>
        <li>
          <span className="h2h-legend-swatch is-good" aria-hidden="true" />
          <span><strong>Ceiling</strong> a great game: red zone</span>
        </li>
        <li>
          <span className="h2h-legend-dot" aria-hidden="true" />
          <span>
            Points so far: <span className="tone-low-text">mint</span> at or under his floor, <span className="tone-good-text">red</span> at or over his ceiling, plain in between
          </span>
        </li>
      </ul>
      <p
        className="h2h-note"
      >
        Updates every 30 seconds. Hover a curve to see the range still to come. Rows outlined are players still to play.
      </p>
    </div>
  );
}
