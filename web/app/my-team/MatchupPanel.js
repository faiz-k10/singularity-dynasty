"use client";

import { useMemo } from "react";
import SlotBadge from "./SlotBadge";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { summarizeSide } from "@/lib/winChance";
import Standings from "./Standings";
import WaiverWire from "./WaiverWire";
import ScoreCurve from "./ScoreCurve";
import { leadState } from "@/lib/leadState";
import { adjustedMatchup } from "@/lib/adjustedMatchup";
import { useMounted } from "./useMounted";

// Sleeper's own page for this week's matchup in a league (opens in a new tab).
export const sleeperMatchupUrl = (leagueId) => (leagueId ? `https://sleeper.com/leagues/${leagueId}/matchup` : null);

const fmt1 = (v) => (v == null ? "—" : v.toFixed(1));
const fmt2 = (v) => (v == null ? "—" : v.toFixed(2)); // points actually scored: two decimals, like Sleeper

export function formatWin(p) {
  // Near-certain is still not certain: only a locked result says YOU WIN, so the extremes read ">99%" / "<1%", never "100%" / "0%".
  return p == null ? "—" : p >= 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`;
}

import { standing, lockIn } from "@/lib/standing";
export { standing };

// Settled results get a settled colour (green: You win / Won, red: Out of reach / Lost) on the word and its bar.
export const sealedClass = (label) => (label === "You win" || label === "Won" ? " is-sealed-win" : label === "Out of reach" || label === "Lost" ? " is-sealed-loss" : "");

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
  // Same reading as the curve, by the zone the score sits in: blue under his floor, red at or over his ceiling, plain
  // anywhere in his normal range (median included).
  const tone = pts == null || o.state === "pre" || typeof p.floor !== "number" || typeof p.ceiling !== "number" ? null : pts < p.floor ? "low" : pts >= p.ceiling ? "good" : "mid";
  const showCurve = !p.out && o.state !== "bye" && p.proj > 0 && typeof p.floor === "number" && typeof p.ceiling === "number" && p.ceiling > p.floor;
  return (
    <div className={`h2h-row${o.state === "in" ? " is-live" : ""}${done ? " is-done" : ""}${o.state === "pre" && !p.out ? " is-upcoming" : ""}`}>
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
        title={
          done || uncertain || o.hi <= 0
            ? undefined
            : `Still to come: ${Math.round(o.lo)}–${Math.round(o.hi)} pts (8 in 10 outcomes)`
        }
      >
        {showCurve ? (
          <ScoreCurve floor={p.floor} median={p.proj} ceiling={p.ceiling} pts={pts} state={o.state} est={p.est} />
        ) : (
          // Nothing to draw a range from (out, bye, or no floor / ceiling): just the median.
          <span className="h2h-curve-text mono">{p.out ? "Out" : fmt1(p.proj)}</span>
        )}
      </span>
      <span
        className={`h2h-c-pts mono live-pts-cell${o.state === "in" ? " is-live" : ""}${tone ? ` tone-${tone}` : ""}`}
        title={o.state === "in" ? "Points so far · game in progress" : o.state === "post" ? "Final points" : "Not started"}
      >
        <span className="h2h-pts-num">
          {o.state === "in" && <span className="matchup-score-live-dot" aria-hidden="true" />}
          {fmt2(pts)}
        </span>
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
        <span className="h2h-c-curve" title="The outcome curve: floor (blue), median projection and ceiling (red) under it, and the points scored so far as the marker on it">Floor · median · ceiling</span>
        <span className="h2h-c-pts">Pts</span>
      </div>
      {side.players.map((p, i) => (
        <SideRow key={p.id || `empty-${i}`} p={p} scoreboardKnown={scoreboardKnown} uncertain={uncertain} mounted={mounted} />
      ))}
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

// The views a league opens on, as tabs: Matchup (this week's scoreboard + both lineups), Standings (with playoff odds,
// once a full refresh has gathered them) and Best available. The switch itself (PanelTabs) lives in the header of
// whoever hosts the panel: the Sunday board's drawer, and the dashboard's opened row (which adds Roster).
export const hasStandings = (team) => Boolean(team?.settings?.season?.standings?.length);
export function leagueTabs(team) {
  return [["matchup", "Matchup"], ...(hasStandings(team) ? [["standings", "Standings"]] : []), ["available", "Best available"]];
}

export function PanelTabs({ tabs, value, onChange }) {
  return (
    <div className="board-toggle league-dash-tabs" role="tablist" aria-label="League view">
      {tabs.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// Head-to-head view for one saved league: this week's two lineups slot by slot with live points, our projection, the
// range still to come and each game's status, under a scoreboard with the live score, projected finals, players left
// and the win chance (lib/winChance.js, computed server-side and refreshed by the 30-second poll). `tab` picks the
// view: "matchup" (default), "standings" (Standings.js) or "available" (WaiverWire.js -- it only loads, and only asks
// Sleeper, once its tab is opened).
export default function MatchupPanel({ team, gameStates, tab = "matchup", playTotals = null }) {
  const s = team.settings || {};
  return (
    <div className="h2h-wrap">
      {tab === "standings" && hasStandings(team) ? (
        <Standings season={s.season} opponent={s.isBye ? null : s.opponent} bare />
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
  // and to the win chance when the play-by-play knows them (lib/adjustedMatchup.js) -- the same numbers as the cards and the live list.
  const adj = useMemo(() => adjustedMatchup(team.settings, gameStates, playTotals), [team.settings, gameStates, playTotals]);
  const mine = adj ? adj.mine : s.h2h ? summarizeSide(s.h2h.mine, gameStates) : null;
  const opp = adj ? adj.opp : s.h2h ? summarizeSide(s.h2h.opp, gameStates) : null;
  const live = adj ? adj.live : s.matchupActual || null;
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
  const pct = adj ? adj.winChance : s.winChance;
  const allDone =
    mine && opp && mine.yetToPlay + mine.playing + opp.yetToPlay + opp.playing === 0 && (mine.pts > 0 || opp.pts > 0);
  const lock = s.bestBall ? null : lockIn(mine, opp, live ? live.mine : mine?.pts ?? null, live ? live.opp : opp?.pts ?? null);
  const st = standing(s.bestBall ? null : pct, allDone, lock);
  const center = (
    <div className={`h2h-center is-${st.key}${sealedClass(st.label)}`}>
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

  // Best ball: no set lineup to compare slot by slot, just the totals.
  if (s.bestBall || !mine || !opp) {
    return (
      <div className="h2h">
        <div className="h2h-board">
          <TeamScore state={leadState(live?.mine, live?.opp)[0]} name={myName} record={s.record} score={live?.mine ?? null} proj={s.matchupProj?.mine ?? null} />
          {center}
          <TeamScore state={leadState(live?.mine, live?.opp)[1]} name={s.opponent} record={s.opponentRecord} score={live?.opp ?? null} proj={s.matchupProj?.opp ?? null} opp />
        </div>
        <p className="h2h-note">
          {s.bestBall
            ? "Best ball: each score is the best possible lineup from every player's points so far, which is what the week is finally scored on (Sleeper fills in its own lineup late, so its number can look far lower early on). There's no set lineup to compare slot by slot and no win chance."
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
        <TeamScore state={leadState(myScore, oppScore)[0]} name={myName} record={s.record} score={myScore} proj={uncertain ? null : myScore + mine.projFinal - mine.pts} left={uncertain ? null : leftLabel(mine)} />
        {center}
        <TeamScore state={leadState(myScore, oppScore)[1]} name={s.opponent} record={s.opponentRecord} score={oppScore} proj={uncertain ? null : oppScore + opp.projFinal - opp.pts} left={uncertain ? null : leftLabel(opp)} opp />
      </div>
      <div className="h2h-lineups">
        <Side title={myName} side={mine} scoreboardKnown={scoreboardKnown} uncertain={uncertain} mounted={mounted} />
        <Side title={s.opponent} side={opp} opp scoreboardKnown={scoreboardKnown} uncertain={uncertain} mounted={mounted} />
      </div>
      <ul className="h2h-legend" aria-label="How to read the curves">
        <li>
          <span className="h2h-legend-swatch is-low" aria-hidden="true" />
          <span><strong>Floor</strong> a bad game: blue zone</span>
        </li>
        <li>
          <span className="h2h-legend-swatch is-mid" aria-hidden="true" />
          <span><strong>Median</strong> his most likely score; 8 in 10 games land on the gold</span>
        </li>
        <li>
          <span className="h2h-legend-swatch is-good" aria-hidden="true" />
          <span><strong>Ceiling</strong> a great game: red zone</span>
        </li>
        <li>
          <span className="h2h-legend-dot" aria-hidden="true" />
          <span>
            Points so far: <span className="tone-low-text">blue</span> under his floor, <span className="tone-good-text">red</span> at or over his ceiling, plain in between
          </span>
        </li>
      </ul>
      <p
        className="h2h-note"
        title="Points already scored are locked in; each starter still to play is simulated 5,000 times from his weekly projection, floor and ceiling (scaled to the time left in a live game). Projected final = points so far + the typical amount still to come."
      >
        Updates every 30 seconds. Hover a curve to see the range still to come. Rows outlined are players still to play.
      </p>
    </div>
  );
}
