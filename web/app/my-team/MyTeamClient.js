"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { UpgradeMoment, BuyInPrompt, startExplorerCheckout } from "./UpgradeMoment";
import EmailDigestToggle from "./EmailDigestToggle";
import { startBackgroundTimer } from "@/lib/backgroundTimer";
import { lookupSleeperTeams, saveTeam, deleteTeam, setBuyIn, refreshSavedTeams, pollLiveScores, getRosterNews, getMyGameLogs } from "./actions";
import TeamBadge from "../tools/TeamBadge";
import LeagueDashboard, { summarizeLeagues } from "./LeagueDashboard";
import RosterNews from "./RosterNews";
import PanelBoard, { StaticPanel } from "./PanelBoard";
import MyWeekFeed from "./MyWeekFeed";
import PositionBadge from "../tools/PositionBadge";
import AchievementDots from "../tools/AchievementDots";
import { sortRows, sortArrow } from "@/lib/sortLink";
import { buildPortfolio, aggregateGames, PORTFOLIO_COLUMN_TYPES } from "@/lib/portfolio";
import { liveRosterNews, lineupChanged } from "@/lib/rosterAlerts";
import { livePointsFor } from "@/lib/gameStatus";
import SlotBadge from "./SlotBadge";
import MatchupPanel, { PanelTabs, leagueTabs } from "./MatchupPanel";
import SundayBoard from "./SundayBoard";
import { isGameDay } from "@/lib/liveFeed";
import DesktopAlertsToggle, { useDesktopAlerts, useDesktopAlertsSetting } from "./DesktopAlerts";

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

// League format at a glance -- teams / roster spots / QB format / scoring
// / TE premium, straight from Sleeper's own league object (see
// actions.js). TE premium only renders when the league actually has one;
// not every league does.
function LeagueBadges({ settings }) {
  if (!settings || !settings.teams) return null;
  return (
    <div className="my-team-settings">
      <span className="my-team-setting-pill pill-teams">{settings.teams} Teams</span>
      {settings.rosterSpots && (
        <span className="my-team-setting-pill pill-roster">{settings.rosterSpots} Roster Spots</span>
      )}
      {settings.starters != null && (
        <span className="my-team-setting-pill pill-white">Start {settings.starters}</span>
      )}
      <span className="my-team-setting-pill pill-qb">{settings.qbFormat}</span>
      <span className="my-team-setting-pill pill-scoring">{settings.scoring}</span>
      {settings.tePremium && (
        <span className="my-team-setting-pill pill-te">{settings.tePremium}</span>
      )}
      {settings.recordTier && (
        <span className={`my-team-setting-pill pill-record-${settings.recordTier}`}>
          {settings.record} Record
        </span>
      )}
    </div>
  );
}

// This week's game -- "Week N" always (once the season/week is known),
// the opponent (with record) or a BYE tag. Rendered on its own line
// under the league name; stays hidden entirely before Sleeper posts a
// week/matchups (offseason lookups just won't carry settings.week). The
// actual proj/live numbers used to render inline here -- they're their
// own figure now, MatchupScoreTable below, on the right of the card's
// summary bar.
function MatchupLine({ settings }) {
  if (!settings || settings.week == null) return null;
  return (
    <span className="my-team-matchup">
      Week {settings.week}
      {settings.isBye ? (
        <> · BYE</>
      ) : settings.opponent ? (
        <>
          {" · vs "}
          <span className="my-team-matchup-opp">{settings.opponent}</span>
          {settings.opponentRecord ? ` (${settings.opponentRecord})` : ""}
        </>
      ) : null}
    </span>
  );
}

function sortByPosition(players) {
  return [...players].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a.position);
    const bi = POSITION_ORDER.indexOf(b.position);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi || a.name.localeCompare(b.name);
  });
}

function formatPct(v) {
  return v === null || v === undefined ? "—" : `${v.toFixed(1)}%`;
}

function formatPts(v) {
  return v === null || v === undefined ? "—" : v.toFixed(1);
}

const ROSTER_COLUMN_TYPES = {
  slot: "string",
  name: "string",
  position: "string",
  team: "string",
  myProjPts: "number",
  livePts: "number",
  startPct: "number",
  rosterPct: "number",
};

// Reuses lib/sortLink's own comparator/arrow so this matches every other
// table's sort behavior exactly (first click = descending, then toggles)
// -- just driven by local React state instead of the URL, since this
// roster preview isn't its own page/searchParams the way /tools/* are.
function Th({ label, sortKeyName, sortKey, sortDir, onSort, className }) {
  return (
    <th className={className}>
      <button
        type="button"
        className={`th-sort-btn${sortKey === sortKeyName ? " sort-active" : ""}`}
        onClick={() => onSort(sortKeyName)}
      >
        {label}
        {sortArrow(sortKeyName, sortKey, sortDir)}
      </button>
    </th>
  );
}

// Defaults to the CURRENT STARTING LINEUP, in Sleeper's own slot order
// (QB, RB, RB, WR, WR, TE, FLEX, FLEX, SUPER_FLEX, ... -- whatever this
// league's roster_positions actually defines, see actions.js's
// slotIndex), not just players grouped by position. "Full Roster" toggle
// reveals the bench. Every column is sortable via local state; switching
// the Starters/Full Roster toggle resets any active sort back to that
// view's own default order, rather than carrying a sort across into a
// view it wasn't set on.
// playerPoints (Sleeper's points so far this week, by player id, this league's scoring) + gameStates (lib/gameStatus.js)
// drive the Points column: "—" until the player's game kicks off, then live (pulsing dot) and final.
function RosterTable({ players: rawPlayers, bestBall = false, playerPoints = null, gameStates = null }) {
  const showLive = Boolean(playerPoints && gameStates && Object.keys(gameStates).length);
  const players = useMemo(
    () =>
      showLive
        ? rawPlayers.map((p) => {
            const { pts, state } = livePointsFor(p, playerPoints, gameStates);
            return { ...p, livePts: pts, liveState: state };
          })
        : rawPlayers,
    [rawPlayers, playerPoints, gameStates, showLive]
  );
  const hasStarters = !bestBall && players.some((p) => p.isStarter);
  const [view, setView] = useState(hasStarters ? "starters" : "full");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");

  const base = view === "starters" ? players.filter((p) => p.isStarter) : players;

  let rows;
  if (sortKey) {
    rows = sortRows(base, sortKey, sortDir, ROSTER_COLUMN_TYPES);
  } else if (view === "starters") {
    rows = [...base].sort((a, b) => a.slotIndex - b.slotIndex);
  } else {
    rows = sortByPosition(base);
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleViewChange(nextView) {
    setView(nextView);
    setSortKey(null);
    setSortDir("desc");
  }

  const thProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <div>
      {bestBall && (
        <p className="my-team-hint my-team-bestball-note">
          Best ball — the platform starts your top scorers each week, so there&apos;s
          no set lineup. Showing your full roster.
        </p>
      )}
      {hasStarters && (
        <div className="board-toggle my-team-view-toggle">
          <button
            type="button"
            className={view === "starters" ? "active" : ""}
            onClick={() => handleViewChange("starters")}
          >
            Starting Lineup
          </button>
          <button
            type="button"
            className={view === "full" ? "active" : ""}
            onClick={() => handleViewChange("full")}
          >
            Full Roster
          </button>
        </div>
      )}
      <div className="rankings-table-wrap roster-table-wrap">
        <table className="rankings-table roster-table">
          <thead>
            <tr>
              {view === "starters" && <Th label="Slot" sortKeyName="slot" {...thProps} />}
              <Th label="Player" sortKeyName="name" className="align-left" {...thProps} />
              <Th label="Pos" sortKeyName="position" {...thProps} />
              <Th label="Team" sortKeyName="team" {...thProps} />
              {showLive && <Th label="Points" sortKeyName="livePts" {...thProps} />}
              <Th label="Singularity Proj" sortKeyName="myProjPts" {...thProps} />
              {view === "full" && <Th label="Start %" sortKeyName="startPct" {...thProps} />}
              {view === "full" && <Th label="Roster %" sortKeyName="rosterPct" {...thProps} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              return (
                <tr
                  key={p.player_id}
                  // The position-color stripe duplicates SlotBadge's own
                  // outline color once Slot is the leading column in the
                  // starting lineup view, so it's only drawn in Full
                  // Roster (where there's no Slot badge doing that job).
                  data-pos={view === "starters" ? undefined : p.position || undefined}
                >
                  {view === "starters" && <td><SlotBadge slot={p.slot} /></td>}
                  <td className="player-cell align-left">
                    {p.name} <AchievementDots achievements={p.achievements || []} />
                  </td>
                  <td><PositionBadge position={p.position} /></td>
                  <td><TeamBadge team={p.team} /></td>
                  {showLive && (
                    <td
                      className={`mono live-pts-cell${p.liveState === "in" ? " is-live" : ""}${
                        p.livePts != null && p.myProjPts != null && p.livePts >= p.myProjPts ? " beat" : ""
                      }`}
                      title={p.liveState === "in" ? "In progress" : p.liveState === "post" ? "Final" : "Not started"}
                    >
                      {p.liveState === "in" && <span className="matchup-score-live-dot" aria-hidden="true" />}
                      {p.livePts == null ? "—" : p.livePts.toFixed(2)}
                    </td>
                  )}
                  <td className="mono">{formatPts(p.myProjPts)}</td>
                  {view === "full" && <td className="mono">{formatPct(p.startPct)}</td>}
                  {view === "full" && <td className="mono">{formatPct(p.rosterPct)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One opened league on the dashboard, as tabs: Matchup (head-to-head with this week's opponent, MatchupPanel.js),
// Standings (with playoff odds), Best available, and Roster (the lineup / full roster table). Opens on the matchup
// whenever this week's schedule is posted. `children` are the league's badges + buy-in + remove controls, shown in the
// header row beside the tabs.
function LeagueDetail({ team, gameStates, children }) {
  const s = team.settings || {};
  const [tab, setTabState] = useState(s.opponent || s.isBye ? "matchup" : "roster");
  const tabs = [...leagueTabs(team), ["roster", "Roster"]];
  // The tab picked per league is remembered per browser.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("myteam.leagueTabs") || "{}")[team.id];
        if (["matchup", "standings", "available", "roster"].includes(saved)) setTabState(saved); // a view this league lacks falls back to Matchup below
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [team.id]);
  function setTab(next) {
    setTabState(next);
    try {
      const all = JSON.parse(localStorage.getItem("myteam.leagueTabs") || "{}");
      localStorage.setItem("myteam.leagueTabs", JSON.stringify({ ...all, [team.id]: next }));
    } catch {}
  }
  return (
    <div className="league-dash-detail">
      <div className="league-dash-detail-head">
        <PanelTabs tabs={tabs} value={tab} onChange={setTab} />
        {children}
      </div>
      {tab === "roster" ? (
        <RosterTable players={team.players || []} bestBall={s.bestBall} playerPoints={s.playerPoints} gameStates={gameStates} />
      ) : (
        <MatchupPanel team={team} gameStates={gameStates} tab={tabs.some(([key]) => key === tab) ? tab : "matchup"} />
      )}
    </div>
  );
}

// Metrics the Analytics scatter + table plot. Two kinds (split into
// optgroups in the axis pickers):
//  - game-log ("gl" prefix, gameLog: true): PPG / total / game count,
//    plus ffopportunity expected points (xFP/G, xFP total) and points
//    over expected (FP−xFP/G) -- all recomputed over only the games
//    matching the filter bar (player_game_log via aggregateGames).
//  - static per-player: projections (snapshot), sim floor/median/ceiling
//    + WOPR/EPA (player_simulations), platform start/roster %, exposure.
const n1 = (v) => v.toFixed(1);
const n0 = (v) => Math.round(v).toString();
const signed = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
const pct0 = (v) => `${Math.round(v)}%`;
const ANALYSIS_METRICS = [
  { key: "glPPG", label: "PPG", fmt: n1, gameLog: true },
  { key: "glTotal", label: "Total Pts", fmt: n0, gameLog: true },
  { key: "glExpPPG", label: "xFP / G", fmt: n1, gameLog: true },
  { key: "glExpTotal", label: "xFP Total", fmt: n0, gameLog: true },
  { key: "glPOE", label: "FP − xFP / G", fmt: signed, gameLog: true },
  { key: "glGames", label: "Games", fmt: n0, gameLog: true },
  { key: "myProjPts", label: "Singularity Proj", fmt: n1 },
  { key: "simMedian", label: "Sim Median", fmt: n0 },
  { key: "simCeiling", label: "Sim Ceiling", fmt: n0 },
  { key: "simFloor", label: "Sim Floor", fmt: n0 },
  { key: "wopr", label: "WOPR", fmt: (v) => v.toFixed(2) },
  { key: "epa", label: "EPA", fmt: signed },
  { key: "startPct", label: "Start %", fmt: pct0 },
  { key: "rosterPct", label: "Roster %", fmt: pct0 },
  { key: "exposurePct", label: "Exposure %", fmt: pct0 },
];

const ANALYSIS_POS_COLOR = {
  QB: "--pos-qb",
  RB: "--pos-rb",
  WR: "--pos-wr",
  TE: "--pos-te",
};

// Sleeper stores height as inches ("71"); some older entries are already
// "6-1" / "6'1\"".
function formatHeight(h) {
  if (h == null || h === "") return null;
  const str = String(h);
  if (str.includes("'")) return str;
  if (str.includes("-")) {
    const [ft, inch] = str.split("-");
    return `${ft}'${inch || 0}"`;
  }
  const n = parseInt(str, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${Math.floor(n / 12)}'${n % 12}"`;
}

function ordinal(x) {
  const s = ["th", "st", "nd", "rd"];
  const v = x % 100;
  return x + (s[(v - 20) % 10] || s[v] || s[0]);
}

function experienceLabel(n) {
  if (n == null) return null;
  return n === 0 ? "Rookie" : `${ordinal(n + 1)} season`;
}

function ageFromBirthDate(birth) {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a -= 1;
  return a;
}

// The right-hand card in Analytics: for whichever point / row the user
// clicked -- demographics from Sleeper's player dict (page.js ->
// playerBios) plus that player's values on the two metrics currently on
// the chart axes.
function PlayerProfileCard({ row, bio, xMetric, yMetric }) {
  if (!row) {
    return (
      <div className="my-analysis-profile my-analysis-profile-empty">
        Click a point or a table row to see the player.
      </div>
    );
  }
  const b = bio || {};
  const age = typeof b.age === "number" ? b.age : ageFromBirthDate(b.birth_date);
  const ht = formatHeight(b.height);
  const bioFields = [
    ["Jersey", b.number != null ? `#${b.number}` : null],
    ["Height", ht],
    ["Weight", b.weight ? `${b.weight} lbs` : null],
    ["Age", age != null ? String(age) : null],
    ["Experience", experienceLabel(b.years_exp)],
  ].filter(([, v]) => v != null);

  const axisFields = [xMetric, yMetric].map((m) => [
    m.label,
    row[m.key] == null ? "—" : m.fmt(row[m.key]),
  ]);

  return (
    <div className="my-analysis-profile">
      <div className="my-analysis-profile-head">
        {/* Sleeper's own headshot CDN, keyed by the Sleeper player id.
            Hidden on 404 (not every player has one). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={row.player_id}
          className="my-analysis-profile-photo"
          src={`https://sleepercdn.com/content/nfl/players/thumb/${row.player_id}.jpg`}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <div className="my-analysis-profile-headtext">
          <span className="my-analysis-profile-name">{row.name}</span>
          <div className="my-analysis-profile-badges">
            <PositionBadge position={row.position} />
            <TeamBadge team={row.team} />
          </div>
        </div>
      </div>
      {bioFields.length > 0 && (
        <dl className="my-analysis-profile-grid">
          {bioFields.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <dl className="my-analysis-profile-grid my-analysis-profile-axes">
        {axisFields.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const SEASON_OPTS = [String(new Date().getFullYear() - 1), String(new Date().getFullYear() - 2)];
const ANALYSIS_POSITIONS = ["QB", "RB", "WR", "TE"];
const DEFAULT_FILTERS = {
  season: "all",
  weekFrom: 1,
  weekTo: 18,
  venue: "all",
  result: "all",
  position: "all",
};

// Human-readable summary of the game window (season/weeks/venue/result --
// NOT position, which filters players not games).
function filterSummary(f) {
  const parts = [];
  parts.push(f.season === "all" ? "both seasons" : f.season);
  if (f.weekFrom > 1 || f.weekTo < 18) parts.push(`weeks ${f.weekFrom}–${f.weekTo}`);
  else parts.push("all weeks");
  if (f.venue !== "all") parts.push(f.venue);
  if (f.result !== "all") parts.push(f.result === "wins" ? "in wins" : "in losses");
  return parts.join(" · ");
}

// The Analytics tab: a filter bar defines a game window (season, week
// range, home/away, wins/losses) plus an optional position filter; the
// "(filtered)" metrics (PPG / total / game count) recompute over that
// window while the static metrics (projections, sims, exposure) don't.
// Pick any two for the X/Y axes; click a point or row for the player card.
function MyAnalysisPanel({ rows, playerBios = {} }) {
  const [selectedId, setSelectedId] = useState(null);
  const [xKey, setXKey] = useState("glPPG");
  const [yKey, setYKey] = useState("myProjPts");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const xM = ANALYSIS_METRICS.find((m) => m.key === xKey) || ANALYSIS_METRICS[0];
  const yM = ANALYSIS_METRICS.find((m) => m.key === yKey) || ANALYSIS_METRICS[1];
  const usesGameLog = xM.gameLog || yM.gameLog;

  const setF = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  // recompute the filtered metrics per player, then narrow to the chosen
  // position (position filters players, not games).
  const derived = rows
    .map((r) => ({ ...r, ...aggregateGames(r._games, filters) }))
    .filter((r) => filters.position === "all" || r.position === filters.position);
  const withWindow = derived.filter((r) => r.glGames > 0);
  const avgWindowGames = withWindow.length
    ? withWindow.reduce((s, r) => s + r.glGames, 0) / withWindow.length
    : 0;
  const poolLabel =
    filters.position === "all" ? "players" : `${filters.position}s`;

  const pts = derived.filter((r) => r[xKey] != null && r[yKey] != null);
  const W = 640;
  const H = 420;
  const padL = 60;
  const padR = 18;
  const padT = 18;
  const padB = 46;
  const xVals = pts.map((p) => p[xKey]);
  const yVals = pts.map((p) => p[yKey]);
  const xMin = Math.min(0, ...xVals);
  const xMax = Math.max(1, ...xVals);
  const yMin = Math.min(0, ...yVals);
  const yMax = Math.max(1, ...yVals);
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const xMean = mean(xVals);
  const yMean = mean(yVals);
  const sx = (v) => padL + ((v - xMin) / (xMax - xMin || 1)) * (W - padL - padR);
  const sy = (v) => H - padB - ((v - yMin) / (yMax - yMin || 1)) * (H - padT - padB);

  const tableRows = [...derived].sort(
    (a, b) => (b[yKey] ?? -Infinity) - (a[yKey] ?? -Infinity) || a.name.localeCompare(b.name)
  );
  const selectedRow = derived.find((r) => r.player_id === selectedId) || null;

  return (
    <div className="my-analysis-panel">
      <p className="my-analysis-note">
        Set a game window with the filters, then plot any two metrics. The
        <em> filtered-games</em> metrics (PPG, totals, expected points and
        points over expected) recompute over just the games that match the window — season, week range, home/away,
        wins/losses. Projections, sims and exposure are season-long.
      </p>

      <div className="my-analysis-filters">
        <label>
          Season
          <select className="compare-select" value={filters.season}
            onChange={(e) => setF({ season: e.target.value })}>
            <option value="all">Both</option>
            {SEASON_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Position
          <select className="compare-select" value={filters.position}
            onChange={(e) => setF({ position: e.target.value })}>
            <option value="all">All</option>
            {ANALYSIS_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          Venue
          <select className="compare-select" value={filters.venue}
            onChange={(e) => setF({ venue: e.target.value })}>
            <option value="all">All</option>
            <option value="home">Home</option>
            <option value="away">Away</option>
          </select>
        </label>
        <label>
          Result
          <select className="compare-select" value={filters.result}
            onChange={(e) => setF({ result: e.target.value })}>
            <option value="all">All</option>
            <option value="wins">Wins</option>
            <option value="losses">Losses</option>
          </select>
        </label>
        <label>
          Weeks
          <span className="my-analysis-week-range">
            <input type="number" min="1" max="18" className="my-analysis-week-input"
              value={filters.weekFrom}
              onChange={(e) => setF({ weekFrom: Math.max(1, Math.min(18, +e.target.value || 1)) })} />
            <span>–</span>
            <input type="number" min="1" max="18" className="my-analysis-week-input"
              value={filters.weekTo}
              onChange={(e) => setF({ weekTo: Math.max(1, Math.min(18, +e.target.value || 18)) })} />
          </span>
        </label>
      </div>
      {usesGameLog && (
        <p className="my-analysis-window-line">
          Filtered games: {filterSummary(filters)} —{" "}
          {withWindow.length} of {derived.length} {poolLabel} have games here
          {withWindow.length ? `, avg ${avgWindowGames.toFixed(1)} each` : ""}.
        </p>
      )}

      <div className="my-analysis-axes">
        <label>
          X axis
          <select
            className="compare-select"
            value={xKey}
            onChange={(e) => setXKey(e.target.value)}
          >
            <optgroup label="Filtered games">
              {ANALYSIS_METRICS.filter((m) => m.gameLog).map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Season-long">
              {ANALYSIS_METRICS.filter((m) => !m.gameLog).map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label>
          Y axis
          <select
            className="compare-select"
            value={yKey}
            onChange={(e) => setYKey(e.target.value)}
          >
            <optgroup label="Filtered games">
              {ANALYSIS_METRICS.filter((m) => m.gameLog).map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Season-long">
              {ANALYSIS_METRICS.filter((m) => !m.gameLog).map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      <div className="my-analysis-main">
      <div className="my-analysis-chart-wrap">
        <svg
          className="my-analysis-chart"
          viewBox={`0 0 ${W} ${H + 28}`}
          role="img"
          aria-label={`${yM.label} versus ${xM.label}`}
        >
          <defs>
            <radialGradient id="macLogoGrad" cx="35%" cy="35%" r="75%">
              <stop className="mac-logo-s0" offset="0%" />
              <stop className="mac-logo-s1" offset="45%" />
              <stop className="mac-logo-s2" offset="80%" />
            </radialGradient>
          </defs>
          <line className="mac-axis" x1={padL} y1={padT} x2={padL} y2={H - padB} />
          <line className="mac-axis" x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} />
          {pts.length > 1 && xMean != null && (
            <>
              <line
                className="mac-mean"
                x1={sx(xMean)}
                y1={padT}
                x2={sx(xMean)}
                y2={H - padB}
              />
              <text className="mac-mean-label" x={sx(xMean) + 4} y={padT + 9} textAnchor="start">
                mean {xM.fmt(xMean)}
              </text>
            </>
          )}
          {pts.length > 1 && yMean != null && (
            <>
              <line
                className="mac-mean"
                x1={padL}
                y1={sy(yMean)}
                x2={W - padR}
                y2={sy(yMean)}
              />
              <text className="mac-mean-label" x={W - padR - 4} y={sy(yMean) - 4} textAnchor="end">
                mean {yM.fmt(yMean)}
              </text>
            </>
          )}
          <text className="mac-axis-label" x={(padL + W - padR) / 2} y={H - 10} textAnchor="middle">
            {xM.label}
          </text>
          <text
            className="mac-axis-label"
            x={16}
            y={(padT + H - padB) / 2}
            textAnchor="middle"
            transform={`rotate(-90 16 ${(padT + H - padB) / 2})`}
          >
            {yM.label}
          </text>
          <text className="mac-tick" x={padL} y={H - padB + 16} textAnchor="start">
            {xM.fmt(xMin)}
          </text>
          <text className="mac-tick" x={W - padR} y={H - padB + 16} textAnchor="end">
            {xM.fmt(xMax)}
          </text>
          <text className="mac-tick" x={padL - 8} y={H - padB} textAnchor="end">
            {yM.fmt(yMin)}
          </text>
          <text className="mac-tick" x={padL - 8} y={padT + 8} textAnchor="end">
            {yM.fmt(yMax)}
          </text>
          {pts.length === 0 && (
            <text
              className="mac-empty"
              x={(padL + W - padR) / 2}
              y={(padT + H - padB) / 2}
              textAnchor="middle"
            >
              No {xM.label} / {yM.label} data for your guys yet
            </text>
          )}
          {pts.map((p) => {
            const cx = sx(p[xKey]);
            const cy = sy(p[yKey]);
            const nearRight = cx > W - padR - 90;
            return (
              <g
                key={p.player_id}
                className={`mac-point${p.player_id === selectedId ? " selected" : ""}`}
                onClick={() => setSelectedId(p.player_id)}
              >
                <circle
                  className="mac-dot"
                  cx={cx}
                  cy={cy}
                  r="5"
                  style={{ fill: `var(${ANALYSIS_POS_COLOR[p.position] || "--neon-blue"})` }}
                />
                <text
                  className="mac-label"
                  x={cx + (nearRight ? -9 : 9)}
                  y={cy + 3.5}
                  textAnchor={nearRight ? "end" : "start"}
                >
                  {p.name}
                </text>
                <title>{`${p.name} — ${xM.label}: ${xM.fmt(p[xKey])}, ${yM.label}: ${yM.fmt(p[yKey])}`}</title>
              </g>
            );
          })}
          <g className="mac-watermark" transform={`translate(${W - padR - 194} ${H + 15})`}>
            <circle cx="7" cy="-4" r="7" fill="url(#macLogoGrad)" />
            <text className="mac-watermark-text" x="22" y="1">
              SINGULARITY DYNASTY
            </text>
          </g>
        </svg>
      </div>

        <PlayerProfileCard
          row={selectedRow}
          bio={playerBios[selectedId]}
          xMetric={xM}
          yMetric={yM}
        />
      </div>

      <div className="rankings-table-wrap">
        <table className="rankings-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th>Team</th>
              {ANALYSIS_METRICS.map((m) => (
                <th key={m.key}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((p) => (
              <tr
                key={p.player_id}
                data-pos={p.position || undefined}
                className={`my-analysis-row${p.player_id === selectedId ? " selected" : ""}`}
                onClick={() => setSelectedId(p.player_id)}
              >
                <td className="player-cell align-left">{p.name}</td>
                <td><PositionBadge position={p.position} /></td>
                <td><TeamBadge team={p.team} /></td>
                {ANALYSIS_METRICS.map((m) => (
                  <td key={m.key} className="mono">
                    {p[m.key] == null ? "—" : m.fmt(p[m.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// The Exposure table can be shown flat or split into collapsible groups.
// "count" = number of saved teams that roster the player (the raw
// exposure count behind the % column).
const EXPOSURE_GROUP_TABS = [
  { key: "none", label: "List" },
  { key: "position", label: "Position" },
  { key: "team", label: "Team" },
  { key: "count", label: "Exposure count" },
];

// Split already-sorted portfolio rows into groups (order within a group
// keeps the active column sort). Returns null for "none" -- caller renders
// the flat table. Each group carries a JSX `label` for its <summary>.
function groupExposureRows(rows, groupBy, teamCount) {
  if (groupBy === "none") return null;
  const map = new Map();
  for (const p of rows) {
    const key =
      groupBy === "position" ? p.position || "—"
      : groupBy === "team" ? p.team || "—"
      : String(p.teams);
    let g = map.get(key);
    if (!g) {
      g = { key, rows: [] };
      map.set(key, g);
    }
    g.rows.push(p);
  }
  const groups = [...map.values()];
  if (groupBy === "position") {
    const order = { QB: 0, RB: 1, WR: 2, TE: 3 };
    groups.sort(
      (a, b) => (order[a.key] ?? 9) - (order[b.key] ?? 9) || a.key.localeCompare(b.key)
    );
    for (const g of groups) {
      g.label = <PositionBadge position={g.key === "—" ? null : g.key} />;
    }
  } else if (groupBy === "team") {
    groups.sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key));
    for (const g of groups) {
      g.label = <TeamBadge team={g.key === "—" ? null : g.key} />;
    }
  } else {
    groups.sort((a, b) => Number(b.key) - Number(a.key));
    for (const g of groups) {
      g.label = (
        <span className="portfolio-group-count">
          On {Number(g.key)} of {teamCount} teams
        </span>
      );
    }
  }
  return groups;
}

// The Exposure table itself -- pulled out so the flat view and each
// grouped <details> render the exact same columns/sort headers.
function ExposureTable({ rows, teamCount, anyBuyIn, thProps }) {
  return (
    <table className="rankings-table">
      <thead>
        <tr>
          <Th label="Player" sortKeyName="name" className="align-left" {...thProps} />
          <Th label="Pos" sortKeyName="position" {...thProps} />
          <Th label="Team" sortKeyName="team" {...thProps} />
          <Th label="Exposure" sortKeyName="exposurePct" {...thProps} />
          <Th label="Starts" sortKeyName="starterCount" {...thProps} />
          {anyBuyIn && <Th label="Invested" sortKeyName="invested" {...thProps} />}
          {anyBuyIn && <Th label="Bankroll %" sortKeyName="weightPct" {...thProps} />}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.player_id} data-pos={p.position || undefined}>
            <td className="player-cell align-left">{p.name}</td>
            <td><PositionBadge position={p.position} /></td>
            <td><TeamBadge team={p.team} /></td>
            <td className="mono">
              <span className="portfolio-exposure">
                <span
                  className="portfolio-exposure-bar"
                  style={{ "--pct": `${p.exposurePct}%` }}
                />
                <span className="portfolio-exposure-label">
                  {p.teams}/{teamCount} · {Math.round(p.exposurePct)}%
                </span>
              </span>
            </td>
            <td className="mono">{p.starterCount}</td>
            {anyBuyIn && (
              <td className="mono">
                {p.hasInvested ? `$${p.invested.toLocaleString()}` : "—"}
              </td>
            )}
            {anyBuyIn && (
              <td className="mono">
                {p.weightPct == null ? "—" : `${p.weightPct.toFixed(1)}%`}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Portfolio({ savedTeams, buyIns, playerSims, playerGameLogs, playerBios, onNeedLogs, logsLoading }) {
  const [tab, setTab] = useState("exposure");
  // The Analytics tab is the only user of the game log, so it is fetched the first time that tab opens (not with the page).
  useEffect(() => {
    if (tab === "analysis") onNeedLogs?.();
  }, [tab, onNeedLogs]);
  const [groupBy, setGroupBy] = useState("none");
  const [openGroups, setOpenGroups] = useState({}); // { [groupKey]: bool } override of the default-open rule
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const { rows, totalBuyIn, teamsWithBuyIn, teamCount } = buildPortfolio(
    savedTeams,
    buyIns,
    playerSims,
    playerGameLogs
  );
  const anyBuyIn = teamsWithBuyIn > 0;

  const defaultSorted = [...rows].sort(
    (a, b) =>
      b.exposurePct - a.exposurePct ||
      b.invested - a.invested ||
      a.name.localeCompare(b.name)
  );
  const display = sortKey
    ? sortRows(rows, sortKey, sortDir, PORTFOLIO_COLUMN_TYPES)
    : defaultSorted;
  const groups = groupExposureRows(display, groupBy, teamCount);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }
  const thProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <div className="my-team-portfolio">
      <div className="portfolio-toggles">
        <div className="board-toggle my-team-view-toggle">
          <button
            type="button"
            className={tab === "exposure" ? "active" : ""}
            onClick={() => setTab("exposure")}
          >
            Exposure
          </button>
          <button
            type="button"
            className={tab === "analysis" ? "active" : ""}
            onClick={() => setTab("analysis")}
          >
            Analytics
          </button>
        </div>

        {tab === "exposure" && (
          <div className="board-toggle">
            {EXPOSURE_GROUP_TABS.map((g) => (
              <button
                key={g.key}
                type="button"
                className={groupBy === g.key ? "active" : ""}
                onClick={() => {
                  setGroupBy(g.key);
                  setOpenGroups({}); // new dimension -> back to defaults
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "analysis" && logsLoading && <p className="board-panel-sub mono">Loading game logs…</p>}
      {tab === "analysis" ? (
        <MyAnalysisPanel rows={rows} playerBios={playerBios} />
      ) : (
        <>
          {groups ? (
            // key distinct from the flat branch's div: without it React
            // reuses the same <div> node and just swaps className, which
            // keeps InteractiveScript's drag-scroll pointerdown handler
            // bound to it -- that handler calls setPointerCapture on a
            // press anywhere inside, swallowing the click that would
            // toggle a group's <summary>.
            <div className="portfolio-groups" key="grouped">
              {groups.map((g) => {
                const gInvested = g.rows.reduce(
                  (s, p) => s + (p.hasInvested ? p.invested : 0),
                  0
                );
                // Every grouping starts fully collapsed -- the point of
                // the grouped view is to drill into one bucket at a time.
                // Manual expand/collapse persists via openGroups.
                const isOpen = openGroups[g.key] ?? false;
                return (
                  <details
                    key={g.key}
                    className="portfolio-group"
                    open={isOpen}
                    onToggle={(e) => {
                      const next = e.currentTarget.open;
                      if (next === isOpen) return;
                      setOpenGroups((s) => ({ ...s, [g.key]: next }));
                    }}
                  >
                    <summary className="portfolio-group-head">
                      <span className="my-team-chevron">▶</span>
                      <span className="portfolio-group-name">{g.label}</span>
                      <span className="portfolio-group-meta">
                        {g.rows.length} {g.rows.length === 1 ? "player" : "players"}
                        {anyBuyIn && gInvested > 0 &&
                          ` · $${gInvested.toLocaleString()}`}
                      </span>
                    </summary>
                    <div className="rankings-table-wrap">
                      <ExposureTable
                        rows={g.rows}
                        teamCount={teamCount}
                        anyBuyIn={anyBuyIn}
                        thProps={thProps}
                      />
                    </div>
                  </details>
                );
              })}
            </div>
          ) : (
            <div className="rankings-table-wrap" key="flat">
              <ExposureTable
                rows={display}
                teamCount={teamCount}
                anyBuyIn={anyBuyIn}
                thProps={thProps}
              />
            </div>
          )}
          {!anyBuyIn && (
            <p className="my-team-hint">
              Set a buy-in on each saved team (below) to see dollars staked per player.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Inline buy-in editor on a saved-team card. Lives inside the <summary>,
// so its clicks are stopped from toggling the <details>. Commits on blur
// / Enter, only when the value actually changed.
function BuyInField({ teamId, value, disabled, onSave }) {
  const asString = value == null ? "" : String(value);
  const [v, setV] = useState(asString);

  return (
    <span
      className="my-team-buyin"
      onClick={(e) => e.stopPropagation()}
    >
      $
      <input
        type="number"
        min="0"
        step="1"
        inputMode="decimal"
        className="my-team-buyin-input"
        placeholder="buy-in"
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onBlur={() => {
          if (v !== asString) onSave(teamId, v);
        }}
      />
    </span>
  );
}

// isSignedIn gates the Save button only -- the lookup itself works
// signed out too (it's a read-only call against Sleeper's public API, no
// Supabase involved), so a visitor can preview their team before ever
// creating an account. tier + savedTeamLimit (null = unlimited) drive
// the "N of M saved" indicator and the swap to an upgrade prompt once a
// free user is at their cap (the server action + DB trigger enforce it
// for real).
export default function MyTeamClient({
  isSignedIn,
  tier,
  savedTeamLimit,
  savedTeams: savedTeamsProp,
  initialGameStates = null,
  playerSims = {},
  playerBios = {},
  overview = null,
  exposure = null,
  feed = null,
  emailDigest = false,
  heading = "My Team",
}) {
  // Saved teams are DB snapshots from whenever they were last saved, so
  // the page overlays live Sleeper data on top: a full refresh on load
  // (record, matchup, roster, projections) and a light score poll every
  // 30s while the tab is visible.
  const [fresh, setFresh] = useState({}); // { [savedTeamId]: {team_name, settings, players} }
  // The Analytics tab's game log: fetched the first time that tab opens ("idle" -> "loading" -> "ready"), not with the page.
  const [gameLogs, setGameLogs] = useState({});
  const [gameLogsState, setGameLogsState] = useState("idle");
  const gameLogsRequested = useRef(false);
  const loadGameLogs = useCallback(() => {
    if (gameLogsRequested.current) return;
    gameLogsRequested.current = true;
    setGameLogsState("loading");
    getMyGameLogs()
      .then((r) => setGameLogs(r?.logs || {}))
      .catch(() => {})
      .finally(() => setGameLogsState("ready"));
  }, []);
  const [liveScores, setLiveScores] = useState({}); // { [savedTeamId]: live fields }
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Teams saved from the lookup panel this session (the server page isn't
  // re-rendered after each save, so they're appended here) and teams removed
  // this session. Merged over the server-provided list.
  const [addedTeams, setAddedTeams] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const baseSaved = useMemo(() => {
    const have = new Set(savedTeamsProp.map((t) => t.id));
    return [...savedTeamsProp, ...addedTeams.filter((t) => !have.has(t.id))].filter(
      (t) => !removedIds.includes(t.id)
    );
  }, [savedTeamsProp, addedTeams, removedIds]);

  const savedTeams = useMemo(
    () =>
      baseSaved.map((t) => {
        const f = fresh[t.id];
        const lv = liveScores[t.id];
        if (!f && !lv) return t;
        const base = f ? { ...t, ...f } : t;
        return {
          ...base,
          settings: {
            ...(t.settings || {}),
            ...(f?.settings || {}),
            ...(lv || {}),
            // recordTier is derived server-side and merged in page.js, not part of a refresh
            ...(t.settings?.recordTier ? { recordTier: t.settings.recordTier } : {}),
          },
        };
      }),
    [baseSaved, fresh, liveScores]
  );

  const hasSaved = baseSaved.length > 0 && isSignedIn;

  // Injury/news feed for rostered players; the server caches the upstream
  // ESPN call for 2 minutes, so polling at that cadence is cheap.
  const [news, setNews] = useState(null);
  // Which games have kicked off (lib/gameStatus.js), from the refresh and the 30s live poll.
  const [gameStates, setGameStates] = useState(initialGameStates);
  const gameStatesRef = useRef(gameStates);
  useEffect(() => {
    gameStatesRef.current = gameStates;
  }, [gameStates]);
  const [newsFilter, setNewsFilter] = useState({ starters: false, injuries: false });
  // Desktop alerts (DesktopAlerts.js, Explorer and up): while they're on, the news + live polls keep running in a
  // background tab so the alerts still arrive.
  const [alertsOn, setAlertsOn] = useDesktopAlertsSetting();
  const alertsOnRef = useRef(false);
  const keepLiveRef = useRef(false); // full screen open: keep the live poll running even when the tab is hidden
  useEffect(() => {
    alertsOnRef.current = alertsOn && tier !== "stargazer";
  }, [alertsOn, tier]);
  useEffect(() => {
    if (!hasSaved) return;
    let alive = true;
    const load = async () => {
      if (document.hidden && !alertsOnRef.current) return;
      const res = await getRosterNews().catch(() => null);
      if (alive && res && !res.error) setNews(res);
    };
    const first = setTimeout(load, 0);
    const t = setInterval(load, 120000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [hasSaved]);

  // Alerts + "starts in" follow the current rosters (fresh after a refresh), not the copy the feed request read.
  const liveNews = useMemo(() => liveRosterNews(savedTeams, news), [savedTeams, news]);
  useDesktopAlerts({ on: alertsOn && tier !== "stargazer", savedTeams, injuriesByTeam: liveNews?.byTeam, gameStates });
  const savedTeamsRef = useRef(savedTeams);
  useEffect(() => {
    savedTeamsRef.current = savedTeams;
  }, [savedTeams]);
  const refreshingRef = useRef(false);

  async function runFullRefresh() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const res = await refreshSavedTeams();
      if (res?.teams) {
        setFresh(res.teams);
        setLiveScores({});
        setUpdatedAt(res.updatedAt || Date.now());
      }
      if (res?.gameStates) setGameStates(res.gameStates);
      // The feed is cached ~2 min upstream, so this is cheap; it picks up any status change along with the new lineup.
      const n = await getRosterNews().catch(() => null);
      if (n && !n.error) setNews(n);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }

  // Keeping saved leagues fresh automatically (refresh on load, live scores every 30s) is part of Explorer and up; a free
  // account sees its saved snapshot and can refresh by hand.
  const autoRefresh = tier !== "stargazer";
  useEffect(() => {
    if (!hasSaved || !autoRefresh) return;
    const first = setTimeout(runFullRefresh, 0);
    const tick = async () => {
      // A hidden tab only keeps polling when something needs it: desktop alerts, or the full-screen board (a second monitor
      // left on the Sunday board is "hidden" whenever another window covers it).
      if (document.hidden && !alertsOnRef.current && !keepLiveRef.current) return;
      const res = await pollLiveScores().catch(() => null);
      if (res?.live) {
        setLiveScores(res.live);
        setUpdatedAt(res.updatedAt || Date.now());
      }
      if (res?.gameStates) setGameStates(res.gameStates);
      // Lineup changed in Sleeper since our copy -> full refresh (lineup, alerts, projections).
      if (lineupChanged(savedTeamsRef.current, res?.lineups)) runFullRefresh();
    };
    // Every 15s while a game is on, every 30s otherwise (scores lag Sleeper's own feed by its refresh plus ours). The timer
    // lives in a worker so a hidden or covered tab keeps its rhythm (lib/backgroundTimer.js).
    const anyLive = () => Object.values(gameStatesRef.current || {}).some((g) => g?.state === "in");
    const stopTimer = startBackgroundTimer(tick, () => (anyLive() ? 15000 : 30000));
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      stopTimer();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasSaved, autoRefresh]);

  // Theater mode: the customizable panel board only lives in a full-screen
  // overlay (same idea as the Rankings / Player Sims theater button); the
  // normal page is the traditional scrolling layout with static panels.
  const [theater, setTheater] = useState(false);
  useEffect(() => {
    keepLiveRef.current = theater;
  }, [theater]);
  // Full-screen layout: the Sunday board (SundayBoard.js) by default on game days, the panel board otherwise; a pick
  // made with the switch holds for the rest of that day (localStorage, a convenience).
  const [theaterPick, setTheaterPick] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("myteam.theaterLayout") || "null");
        if (saved?.day === new Date().toDateString()) setTheaterPick(saved.layout);
        // Full screen stays open across reloads (a second monitor left on the Sunday board).
        if (localStorage.getItem("myteam.theaterOpen") === "1") setTheater(true);
      } catch {}
      theaterLoaded.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const theaterLoaded = useRef(false);
  useEffect(() => {
    if (!theaterLoaded.current) return;
    try {
      localStorage.setItem("myteam.theaterOpen", theater ? "1" : "0");
    } catch {}
  }, [theater]);
  function pickTheaterLayout(layout) {
    setTheaterPick(layout);
    try {
      localStorage.setItem("myteam.theaterLayout", JSON.stringify({ layout, day: new Date().toDateString() }));
    } catch {}
  }
  useEffect(() => {
    if (!theater) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") setTheater(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [theater]);

  // The landing page's Sleeper box remembers the username; it prefills here so "Save your leagues" is one click.
  const rememberedUsername = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem("sd-sleeper-user") || "";
      } catch {
        return "";
      }
    },
    () => ""
  );
  const [typedUsername, setUsername] = useState(null);
  const username = typedUsername ?? rememberedUsername;
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [savedKeys, setSavedKeys] = useState(
    new Set(savedTeamsProp.map((t) => t.platform_league_id))
  );
  const [pending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // buy-in per saved team id, seeded from the DB and updated in place so
  // the Portfolio table re-totals without a page reload.
  const [buyIns, setBuyIns] = useState(() =>
    Object.fromEntries(savedTeamsProp.map((t) => [t.id, t.buy_in ?? null]))
  );
  const [buyInSavingId, setBuyInSavingId] = useState(null);
  // Right after a save, ask what the league cost to enter (BuyInPrompt); { id, name } of the team just saved.
  const [buyInPrompt, setBuyInPrompt] = useState(null);

  function handleSetBuyIn(teamId, raw) {
    setBuyInSavingId(teamId);
    startTransition(async () => {
      const res = await setBuyIn(teamId, raw);
      setBuyInSavingId(null);
      if (res.error) {
        setError(res.error);
      } else {
        setBuyIns((prev) => ({ ...prev, [teamId]: res.buyIn }));
      }
    });
  }

  function handleLookup(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await lookupSleeperTeams(username);
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
      }
    });
  }

  // Saves one looked-up team and appends it to the local saved list (no
  // page refresh). Returns the saveTeam result.
  async function saveOne(team, sleeperUsername) {
    const res = await saveTeam({
      sleeperUsername,
      leagueId: team.league_id,
      leagueName: team.league_name,
      teamName: team.team_name,
      rosterId: team.roster_id,
      settings: team.settings,
      players: team.players,
    });
    if (!res.error && res.id) {
      setSavedKeys((prev) => new Set(prev).add(team.league_id));
      setAddedTeams((prev) => [
        ...prev,
        {
          id: res.id,
          platform: "sleeper",
          platform_username: sleeperUsername,
          platform_league_id: team.league_id,
          platform_roster_id: team.roster_id ? String(team.roster_id) : null,
          league_name: team.league_name,
          team_name: team.team_name,
          settings: team.settings,
          players: team.players,
          buy_in: null,
        },
      ]);
    }
    return res;
  }

  function handleSave(e, team, sleeperUsername) {
    e.preventDefault();
    setError(null);
    setSavingKey(team.league_id);
    startTransition(async () => {
      const res = await saveOne(team, sleeperUsername);
      setSavingKey(null);
      if (res.error) setError(res.error);
      else if (res.id) setBuyInPrompt((cur) => cur || { id: res.id, name: team.league_name });
    });
  }

  // Saves every not-yet-saved team from the lookup, one after another,
  // stopping at the plan's team limit.
  function handleSaveAll(teams, sleeperUsername) {
    setError(null);
    startTransition(async () => {
      for (const team of teams) {
        setSavingKey(team.league_id);
        const res = await saveOne(team, sleeperUsername);
        if (res.error) {
          setError(res.error);
          break;
        }
        if (res.id) setBuyInPrompt((cur) => cur || { id: res.id, name: team.league_name });
      }
      setSavingKey(null);
    });
  }

  function handleDelete(id) {
    setDeletingId(id);
    const league = savedTeams.find((t) => t.id === id)?.platform_league_id;
    startTransition(async () => {
      const res = await deleteTeam(id);
      setDeletingId(null);
      if (!res?.error) {
        setRemovedIds((prev) => [...prev, id]);
        if (league) {
          setSavedKeys((prev) => {
            const next = new Set(prev);
            next.delete(league);
            return next;
          });
        }
      }
    });
  }

  const savedCount = savedKeys.size;
  const atLimit = savedTeamLimit != null && savedCount >= savedTeamLimit;

  const alertsToggle = hasSaved ? <DesktopAlertsToggle on={alertsOn} setOn={setAlertsOn} allowed={autoRefresh} /> : null;
  const teamsActions = (hasSaved || (isSignedIn && savedTeamLimit != null)) && (
    <>
      {alertsToggle}
      {hasSaved && (
        <span>
          {updatedAt
            ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
            : autoRefresh
              ? "Updating…"
              : "Saved snapshot"}
          {!autoRefresh && (
            <>
              {" · "}
              <Link href="/#pricing">auto-refresh: Explorer</Link>
            </>
          )}
        </span>
      )}
      {hasSaved && (
        <button type="button" className="my-team-remove" disabled={refreshing} onClick={runFullRefresh}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      )}
      {isSignedIn && savedTeamLimit != null && (
        <span>
          {savedCount} of {savedTeamLimit} saved
          {atLimit && (
            <>
              {" · "}
              <Link href="/#pricing">upgrade for more</Link>
            </>
          )}
        </span>
      )}
    </>
  );

  const sum = summarizeLeagues(savedTeams, liveNews?.byTeam);
  const teamsSub = (
    <>
      <span><strong>{sum.leagues}</strong> {sum.leagues === 1 ? "league" : "leagues"}</span>
      <span className="up"><strong>{sum.leading}</strong> leading</span>
      <span className="down"><strong>{sum.trailing}</strong> trailing</span>
      <span className={sum.alerts ? "down" : ""}><strong>{sum.alerts}</strong> lineup alerts</span>
    </>
  );

  const newsActions = (
    <>
      <label><input type="checkbox" checked={newsFilter.starters} onChange={(e) => setNewsFilter((f) => ({ ...f, starters: e.target.checked }))} /> Starters</label>
      <label><input type="checkbox" checked={newsFilter.injuries} onChange={(e) => setNewsFilter((f) => ({ ...f, injuries: e.target.checked }))} /> Injuries</label>
    </>
  );

  const pf = buildPortfolio(savedTeams, buyIns, {}, {});
  const portfolioActions = (
    <span>
      {pf.rows.length} players across {pf.teamCount} teams
      {pf.teamsWithBuyIn > 0 && ` · $${pf.totalBuyIn.toLocaleString()} staked${pf.teamsWithBuyIn < pf.teamCount ? ` (${pf.teamsWithBuyIn}/${pf.teamCount} teams)` : ""}`}
    </span>
  );

  const teamsNode = (
        <div className="my-team-saved">
          <LeagueDashboard
            savedTeams={savedTeams}
            injuriesByTeam={liveNews?.byTeam}
            refreshing={refreshing}
            renderExpanded={(t) => (
              <LeagueDetail key={t.id} team={t} gameStates={gameStates}>
                  <LeagueBadges settings={t.settings} />
                  <BuyInField
                    teamId={t.id}
                    value={buyIns[t.id] ?? t.buy_in ?? null}
                    disabled={pending && buyInSavingId === t.id}
                    onSave={handleSetBuyIn}
                  />
                  <button
                    type="button"
                    className="my-team-remove"
                    disabled={pending && deletingId === t.id}
                    onClick={() => handleDelete(t.id)}
                  >
                    {pending && deletingId === t.id ? "Removing…" : "Remove"}
                  </button>
              </LeagueDetail>
            )}
          />
        </div>
  );

  // "Save all" lives in the lookup row beside Find My Teams: everything from
  // the current lookup that isn't saved yet, capped at the plan's team limit.
  const unsavedFromLookup = result ? result.teams.filter((t) => !savedKeys.has(t.league_id)) : [];
  const saveAllRoom = savedTeamLimit == null ? unsavedFromLookup.length : Math.max(savedTeamLimit - savedCount, 0);
  const saveAllCount = Math.min(unsavedFromLookup.length, saveAllRoom);

  const lookupNode = (
    <div className="my-team-lookup-stack">
      <form className="my-team-lookup glass-panel" onSubmit={handleLookup}>
        <label htmlFor="sleeper-username" className="my-team-label">
          Sleeper Username
        </label>
        <div className="my-team-lookup-row">
          <input
            id="sleeper-username"
            className="player-search-input"
            type="text"
            placeholder="e.g. yourusername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending && !result && !error ? "Looking Up…" : "Find My Teams"}
          </button>
          {isSignedIn && saveAllCount > 1 && (
            <button
              type="button"
              className="btn-ghost my-team-save-all"
              disabled={pending}
              onClick={() => handleSaveAll(unsavedFromLookup.slice(0, saveAllCount), result.sleeperUsername)}
            >
              {pending && savingKey ? "Saving…" : `Save all ${saveAllCount} teams`}
            </button>
          )}
        </div>
      </form>

      {error && <div className="my-team-error">{error}</div>}

      {isSignedIn && buyInPrompt && (
        <BuyInPrompt
          key={buyInPrompt.id}
          leagueName={buyInPrompt.name}
          tier={tier}
          saving={buyInSavingId === buyInPrompt.id}
          onSave={(v) => handleSetBuyIn(buyInPrompt.id, v)}
          onSkip={() => setBuyInPrompt(null)}
        />
      )}

      {isSignedIn && atLimit && result && result.teams.some((t) => !savedKeys.has(t.league_id)) && (
        <UpgradeMoment teams={result.teams} savedCount={savedCount} limit={savedTeamLimit} />
      )}

      {result &&
        (() => {
          // Teams already in the saved section above are hidden here so
          // the lookup results only show what's new to add.
          const unsaved = result.teams.filter((t) => !savedKeys.has(t.league_id));
          if (unsaved.length === 0) {
            return (
              <p className="my-team-hint my-team-all-saved">
                Every team for {result.sleeperUsername} is already saved above.
              </p>
            );
          }
          return (
            <div className="my-team-results">
              {unsaved.map((team) => (
                <details key={team.league_id} className="my-team-result-card reveal in">
                  <summary className="my-team-result-head">
                    <div className="my-team-result-title">
                      <span className="my-team-chevron">▸</span>
                      <div>
                        <h3>
                          {team.team_name}
                          {team.settings?.record && (
                            <span className="my-team-record">{team.settings.record}</span>
                          )}
                        </h3>
                        <span className="my-team-result-league">{team.league_name}</span>
                        <MatchupLine settings={team.settings} />
                        <LeagueBadges settings={team.settings} />
                      </div>
                    </div>
                    {!isSignedIn ? (
                      <a href="/login" className="round-btn outline my-team-save-btn">
                        Sign In To Save
                      </a>
                    ) : atLimit ? (
                      <button
                        type="button"
                        className="round-btn outline my-team-save-btn"
                        onClick={(e) => {
                          e.preventDefault();
                          startExplorerCheckout("annual").catch(() => setError("Couldn't start checkout. Please try again."));
                        }}
                      >
                        Unlock To Save
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="round-btn primary my-team-save-btn"
                        disabled={pending}
                        onClick={(e) => handleSave(e, team, result.sleeperUsername)}
                      >
                        {pending && savingKey === team.league_id ? "Saving…" : "Save Team"}
                      </button>
                    )}
                  </summary>
                  <RosterTable players={team.players} bestBall={team.settings?.bestBall} playerPoints={team.settings?.playerPoints} gameStates={gameStates} />
                </details>
              ))}
            </div>
          );
        })()}
    </div>
  );

  // Page title row: eyebrow + heading on the left, the theater button (when
  // there's a dashboard to put in theater) on the right.
  const headingRow = (btn) => (
    <div className="my-team-titlebar">
      <div>
        <div className="eyebrow">My Team</div>
        <h1>{heading}</h1>
      </div>
      {btn}
    </div>
  );

  // No saved teams yet: just the lookup, no dashboard to arrange.
  if (savedTeams.length === 0) {
    return <div className="my-team-wrap">{headingRow(null)}{lookupNode}</div>;
  }

  const panels = [
    overview && { id: "overview", title: "Overview", node: overview, defaultOpen: false },
    {
      id: "week",
      title: "Your Players This Week",
      sub: feed?.ready && feed.week != null ? `Week ${feed.week} vs ${feed.prevWeek}` : null,
      node: (
        <>
          <EmailDigestToggle tier={tier} enabled={emailDigest} />
          <MyWeekFeed feed={feed} />
        </>
      ),
    },
    { id: "teams", title: "Saved Teams", node: teamsNode, sub: teamsSub, actions: teamsActions || null },
    exposure && { id: "exposure", title: "Player Exposure", node: exposure },
    hasSaved && {
      id: "news",
      title: "Injury & News",
      capped: true,
      node: <RosterNews news={liveNews} onlyStarters={newsFilter.starters} onlyInjuries={newsFilter.injuries} />,
      actions: newsActions,
    },
    savedTeams.length >= 2 && {
      id: "portfolio",
      title: "My Guys",
      defaultOpen: false,
      actions: portfolioActions,
      node: (
        <Portfolio
          savedTeams={savedTeams}
          buyIns={buyIns}
          playerSims={playerSims}
          playerGameLogs={gameLogs}
          playerBios={playerBios}
          onNeedLogs={loadGameLogs}
          logsLoading={gameLogsState === "loading"}
        />
      ),
    },
    { id: "lookup", title: "Find Teams", node: lookupNode, defaultOpen: false },
  ].filter(Boolean);

  const theaterBtn = (
    <button
      type="button"
      className="rankings-theater-btn"
      onClick={() => setTheater((v) => !v)}
      aria-label={theater ? "Exit full screen" : "Open full screen (Sunday board and panels)"}
      title={theater ? "Exit full screen (Esc)" : "Full screen — Sunday board and customizable panels"}
    >
      {theater ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M4 15h3a2 2 0 0 1 2 2v3M15 20v-3a2 2 0 0 1 2-2h3" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 4H6a2 2 0 0 0-2 2v3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M15 20h3a2 2 0 0 0 2-2v-3" />
        </svg>
      )}
    </button>
  );

  // Normal page: overview on top, then a main column of static panels with
  // the Player Exposure list pinned in a right-hand column.
  const staticIds = new Set(["week", "teams", "news", "portfolio", "lookup"]);
  const staticPanels = panels.filter((p) => staticIds.has(p.id));

  const theaterLayout = theaterPick || (isGameDay(gameStates) ? "board" : "panels");
  const layoutSwitch = (
    <div className="board-orient" role="group" aria-label="Full-screen layout">
      <button type="button" aria-pressed={theaterLayout === "board"} onClick={() => pickTheaterLayout("board")} title="Every league + your players live">
        Sunday board
      </button>
      <button type="button" aria-pressed={theaterLayout === "panels"} onClick={() => pickTheaterLayout("panels")} title="Customizable panels">
        Panels
      </button>
    </div>
  );

  return (
    <div className="my-team-wrap">
      {theater ? (
        <div className="my-team-theater">
          {theaterLayout === "board" ? (
            <SundayBoard
              savedTeams={savedTeams}
              gameStates={gameStates}
              injuriesByTeam={liveNews?.byTeam}
              updatedAt={updatedAt}
              toolbar={<>{alertsToggle}{layoutSwitch}{theaterBtn}</>}
            />
          ) : (
            <PanelBoard panels={panels} headerExtra={<>{layoutSwitch}{theaterBtn}</>} />
          )}
        </div>
      ) : (
        <>
          {headingRow(theaterBtn)}
          {overview}
          <div className={`my-team-layout${exposure ? " has-side" : ""}`}>
            <div className="my-team-main my-team-main-stack">
              {staticPanels.map((p) => (
                <StaticPanel key={p.id} panel={p} />
              ))}
            </div>
            {exposure}
          </div>
        </>
      )}
    </div>
  );
}
