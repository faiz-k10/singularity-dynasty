"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MatchupPanel, { sleeperMatchupUrl, formatWin, standing } from "./MatchupPanel";
import { useMounted } from "./useMounted";
import { buildRow, isTyping, moveFocus } from "./LeagueDashboard";
import { formatOdds, oddsTone } from "./Standings";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { summarizeSide } from "@/lib/winChance";
import { buildLiveFeed, trackScoring, sortFeed } from "@/lib/liveFeed";

const fmt1 = (v) => (v == null ? "—" : v.toFixed(1));
// "Christian McCaffrey" -> "C. McCaffrey"
const shortName = (name) => {
  const [first, ...rest] = String(name || "").split(" ");
  return rest.length ? `${first[0]}. ${rest.join(" ")}` : first;
};

const kickoff = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
};

// The number briefly glows when it changes between polls (not on first paint).
function Score({ value, lead }) {
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (prev.current != null && value != null && value !== prev.current) setBump((b) => b + 1);
    prev.current = value;
  }, [value]);
  return (
    <span key={bump} className={`sb-card-score mono${lead ? " lead" : ""}${bump ? " bumped" : ""}`}>
      {fmt1(value)}
    </span>
  );
}

// One league at a glance, built to answer "am I winning?" in one look: the standing (Favored / Toss-up / Underdog,
// Won / Lost once every game is over) with the win chance, the two scores with yours marked, who of yours is still to
// play, then playoffs and alerts in plain words. Colour means one thing everywhere: gold = going your way, blue = not.
function LeagueCard({ team, gameStates, injuries, onOpen }) {
  const mounted = useMounted();
  const s = team.settings || {};
  const row = buildRow(team, injuries);
  const mine = useMemo(() => (s.h2h ? summarizeSide(s.h2h.mine, gameStates) : null), [s.h2h, gameStates]);
  const opp = useMemo(() => (s.h2h ? summarizeSide(s.h2h.opp, gameStates) : null), [s.h2h, gameStates]);
  const live = s.matchupActual;
  const myScore = live ? live.mine : mine?.pts ?? null;
  const oppScore = live ? live.opp : opp?.pts ?? null;
  const pct = row.winPct;
  const playing = (mine?.playing || 0) + (opp?.playing || 0);
  const toPlay = (mine?.yetToPlay || 0) + (opp?.yetToPlay || 0);
  const started = myScore > 0 || oppScore > 0 || playing > 0;
  const done = Boolean(mine && opp && started && playing === 0 && toPlay === 0);
  const st = standing(pct, done);
  const url = sleeperMatchupUrl(team.platform_league_id);
  const alerts = row.outStarters.length;
  const myLeft = mine ? mine.players.filter((p) => p.outlook.state === "pre" || p.outlook.state === "in" || p.outlook.state === null) : [];
  // Earliest kickoff still to come on either side.
  const nextStart = [...(mine?.players || []), ...(opp?.players || [])]
    .filter((p) => p.outlook.state === "pre" && p.outlook.start)
    .map((p) => p.outlook.start)
    .sort()[0];
  const oppLeft = opp ? opp.yetToPlay + opp.playing : 0;
  const status = done ? "Final" : playing ? "Live" : nextStart && mounted ? `Next ${kickoff(nextStart)}` : null;
  const hasMatchup = !s.isBye && s.opponent;

  return (
    <div
      className={`sb-card is-${st.key}`}
      role="button"
      tabIndex={0}
      data-league-id={team.id}
      onClick={() => onOpen(team.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(team.id);
        }
      }}
      aria-label={`${row.league}: open the matchup`}
    >
      <div className="sb-card-head">
        <span className="sb-card-league">{row.league}</span>
        {status && hasMatchup && (
          <span className={`sb-card-status mono${playing ? " is-live" : ""}`}>
            {playing > 0 && <span className="sb-live-dot" aria-hidden="true" />}
            {status}
          </span>
        )}
        {url && (
          <a
            className="sb-card-sleeper"
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
        <div className="sb-card-empty">Bye week</div>
      ) : !s.opponent ? (
        <div className="sb-card-empty">Matchup not posted yet</div>
      ) : (
        <>
          {st.label ? (
            <div className="sb-card-verdict">
              <span className="sb-card-word">{st.label}</span>
              {!done && pct > 0.005 && pct < 0.995 && <span className="sb-card-pct mono">{formatWin(pct)} to win</span>}
            </div>
          ) : (
            <div className="sb-card-verdict">
              <span className="sb-card-word sb-muted">{s.bestBall ? "Best ball" : "—"}</span>
              {s.bestBall && <span className="sb-card-pct mono">Top scorers start automatically</span>}
            </div>
          )}
          {pct != null && !done && (
            <span className="sb-card-meter" aria-hidden="true">
              <span style={{ width: `${Math.max(2, pct * 100)}%` }} />
            </span>
          )}

          <div className="sb-card-scores">
            <div className="sb-card-side is-me">
              <span className="sb-card-you mono">You</span>
              <span className="sb-card-team">{row.team}</span>
              <Score value={myScore} lead={myScore != null && oppScore != null && myScore >= oppScore} />
            </div>
            <div className="sb-card-side">
              <span className="sb-card-you" aria-hidden="true" />
              <span className="sb-card-team sb-muted">{row.opponent}</span>
              <Score value={oppScore} lead={myScore != null && oppScore != null && oppScore > myScore} />
            </div>
          </div>

          <div className="sb-card-foot">
            {myLeft.length > 0 ? (
              <span className="sb-card-todo" title="Your starters still to play or playing now">
                <span className="sb-card-label">Still to play</span>
                {myLeft.map((p) => (
                  <span key={p.id} className={p.outlook.state === "in" ? "is-live" : ""}>
                    {shortName(p.name)}
                  </span>
                ))}
                {oppLeft > 0 && <span className="sb-muted">· them {oppLeft}</span>}
              </span>
            ) : (
              <span className="sb-card-todo sb-muted">{done ? "All games final" : oppLeft > 0 ? `All yours done · them ${oppLeft} to play` : "All yours done"}</span>
            )}
            <span className="sb-card-extras">
              {row.playoffOdds != null && (
                <span className={`sb-card-odds mono ${oddsTone(row.playoffOdds)}`} title="Chance to make the playoffs">
                  Playoffs {formatOdds(row.playoffOdds)}
                </span>
              )}
              {alerts > 0 && (
                <span className="sb-card-alerts mono" title={row.outStarters.map((p) => `${p.name}: ${p.status}`).join("\n")}>
                  {alerts} {alerts === 1 ? "alert" : "alerts"}
                </span>
              )}
            </span>
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
        <h2 className="board-panel-title">Your players</h2>
        <span className="sb-feed-total mono" title="Every start counts once per league, in that league's scoring">
          <strong>{fmt1(feed.points)}</strong> pts across {feed.starts} {feed.starts === 1 ? "start" : "starts"}
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
                  <span className="sb-feed-leagues">
                    {r.pts === r.ptsMin
                      ? r.starts.map((x) => x.league).join(" · ")
                      : r.starts.map((x) => `${x.league} ${fmt1(x.pts)}`).join(" · ")}
                  </span>
                </div>
                <div className="sb-feed-nums">
                  <span className={`sb-feed-pts mono live-pts-cell${r.state === "in" ? " is-live" : ""}${beat ? " beat" : ""}`}>
                    {r.state === "in" && <span className="matchup-score-live-dot" aria-hidden="true" />}
                    {fmt1(r.pts)}
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
// Keyboard: j / k or the arrow keys move between cards, Enter opens one, Esc closes the drawer (a second Esc leaves
// full screen). The open drawer is remembered per browser, so a reload lands back on the same matchup.
export default function SundayBoard({ savedTeams, gameStates, injuriesByTeam, updatedAt, toolbar }) {
  const mounted = useMounted();
  const [openId, setOpenIdState] = useState(null);
  const openTeam = openId ? savedTeams.find((t) => t.id === openId) : null;
  const gridRef = useRef(null);
  const lastCard = useRef(null);

  function setOpenId(id) {
    if (id) lastCard.current = id;
    setOpenIdState(id);
    try {
      localStorage.setItem("myteam.boardOpen", id || "");
    } catch {}
  }
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const id = localStorage.getItem("myteam.boardOpen");
        if (id) {
          lastCard.current = id;
          setOpenIdState(id);
        }
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Esc closes the drawer first (capture phase, so the theater's own Esc handler doesn't also fire) and puts focus
  // back on that league's card.
  useEffect(() => {
    if (!openId) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpenId(null);
      setTimeout(() => gridRef.current?.querySelector(`[data-league-id="${lastCard.current}"]`)?.focus(), 0);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openId]);

  // j / k / arrows between cards while no drawer is open.
  useEffect(() => {
    if (openId) return;
    const onKey = (e) => {
      if (isTyping(e)) return;
      const step = e.key === "j" || e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "k" || e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      const inGrid = gridRef.current?.contains(document.activeElement);
      if (!inGrid && e.key !== "j" && e.key !== "k") return; // arrows only once a card has focus
      e.preventDefault();
      moveFocus(gridRef.current, ".sb-card", step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  let ahead = 0;
  let close = 0;
  let behind = 0;
  let alerts = 0;
  let live = 0;
  for (const t of savedTeams) {
    const r = buildRow(t, injuriesByTeam?.[t.id]);
    if (r.winPct != null) r.winPct >= 0.6 ? ahead++ : r.winPct <= 0.4 ? behind++ : close++;
    alerts += r.outStarters.length;
    for (const p of t.settings?.h2h?.mine || []) if (gameStates?.[p.team]?.state === "in") { live++; break; }
  }
  const week = savedTeams.find((t) => t.settings?.week)?.settings.week;
  const time = updatedAt && mounted ? new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const counted = ahead + close + behind;
  // One plain sentence instead of a row of counters.
  const parts = [];
  if (counted) parts.push(`Favored in ${ahead} of ${counted}`);
  if (close) parts.push(`${close} too close to call`);
  if (alerts) parts.push(`${alerts} lineup ${alerts === 1 ? "alert" : "alerts"}`);

  return (
    <div className="sb">
      <div className="sb-top">
        <div className="sb-heading">
          <h2 className="sb-title">Week {week ?? "—"}</h2>
          <p className="sb-summary">{parts.join(" · ") || `${savedTeams.length} leagues`}</p>
        </div>
        <span className="board-dock-spacer" />
        {time && (
          <span className={`sb-updated mono${live ? " is-live" : ""}`} title="Scores refresh every 30 seconds">
            {live > 0 && <span className="sb-live-dot" aria-hidden="true" />}
            {live > 0 ? "Live" : "Updated"} · {time}
          </span>
        )}
        {toolbar}
      </div>
      <div className="sb-body">
        <div className="sb-grid" ref={gridRef}>
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
