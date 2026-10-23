"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MatchupPanel, { sleeperMatchupUrl, formatWin, standing, sealedClass, PanelTabs, leagueTabs } from "./MatchupPanel";
import { useMounted } from "./useMounted";
import { buildRow, isTyping, moveFocus } from "./LeagueDashboard";
import { formatOdds, oddsTone } from "./Standings";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { summarizeSide } from "@/lib/winChance";
import { buildLiveFeed, trackScoring, sortFeed, applyPending } from "@/lib/liveFeed";
import { adjustedMatchup } from "@/lib/adjustedMatchup";
import { lockIn } from "@/lib/standing";
import { getLivePlays } from "./actions";
import { leadState } from "@/lib/leadState";
import { leagueFacts, matchesFilters, emptyFilters, filterCount } from "@/lib/boardFilters";
import BoardFilters from "./BoardFilters";
import Companion from "./Companion";

const fmt1 = (v) => (v == null ? "—" : v.toFixed(1));
// Scores (points actually scored) show two decimals, like Sleeper's; projections stay at one.
const fmt2 = (v) => (v == null ? "—" : v.toFixed(2));
// "Christian McCaffrey" -> "C. McCaffrey"
const shortName = (name) => {
  const [first, ...rest] = String(name || "").split(" ");
  return rest.length ? `${first[0]}. ${rest.join(" ")}` : first;
};

// The number briefly glows when it changes between polls (not on first paint); green while leading, red while trailing.
function Score({ value, state }) {
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (prev.current != null && value != null && value !== prev.current) setBump((b) => b + 1);
    prev.current = value;
  }, [value]);
  return (
    <span key={bump} className={`sb-card-score mono${state ? ` is-${state}` : ""}${bump ? " bumped" : ""}`}>
      {fmt2(value)}
    </span>
  );
}

// Everything a league card (and the filters) need to know about this week's matchup, computed once.
function matchupState(team, gameStates, injuries, playTotals = null) {
  const s = team.settings || {};
  const row = buildRow(team, injuries);
  // The plays Sleeper hasn't posted yet are added to the lineups, the totals and the win chance (lib/adjustedMatchup.js), so a
  // card is on the same clock as the live list and the open matchup.
  const adj = adjustedMatchup(s, gameStates, playTotals);
  const mine = adj ? adj.mine : s.h2h ? summarizeSide(s.h2h.mine, gameStates) : null;
  const opp = adj ? adj.opp : s.h2h ? summarizeSide(s.h2h.opp, gameStates) : null;
  const live = adj ? adj.live : s.matchupActual;
  const myScore = live ? live.mine : mine?.pts ?? null;
  const oppScore = live ? live.opp : opp?.pts ?? null;
  const pct = adj ? adj.winChance : row.winPct;
  const playing = (mine?.playing || 0) + (opp?.playing || 0);
  const toPlay = (mine?.yetToPlay || 0) + (opp?.yetToPlay || 0);
  const started = myScore > 0 || oppScore > 0 || playing > 0;
  const done = Boolean(mine && opp && started && playing === 0 && toPlay === 0);
  // YOU WIN / Out of reach only when the result is locked (lib/standing.js lockIn), never from the percentage alone.
  const lock = lockIn(mine, opp, myScore, oppScore);
  const st = standing(pct, done, lock);
  return { s, row, mine, opp, myScore, oppScore, pct, playing, toPlay, done, st, lock };
}

// One league at a glance, built to answer "am I winning?" in one look: the standing (Favored / Toss-up / Underdog,
// Won / Lost once every game is over) with the win chance, the two scores (green leading, red trailing), who of yours is still to
// play, then playoffs and alerts in plain words. Colour means one thing everywhere: gold = going your way, blue = not.
function LeagueCard({ team, gameStates, injuries, onOpen, playTotals }) {
  const mounted = useMounted();
  const { s, row, mine, opp, myScore, oppScore, pct, playing, done, st, lock } = useMemo(() => matchupState(team, gameStates, injuries, playTotals), [team, gameStates, injuries, playTotals]);
  const url = sleeperMatchupUrl(team.platform_league_id);
  // The card's border is its win chance: the card's width is the bar. The top and bottom borders fill from the left edge by the
  // same share -- the chance to win -- and the left edge is always drawn; all the way across (locked in / won) closes the box.
  // A settled game uses the final score; a loss keeps a short stub so its colour still shows.
  // With no win chance to show (best ball has no head-to-head), the border is the chance to make the playoffs instead, in the same
  // green / gold / red as the "Playoffs N%" text.
  const oddsRing = pct == null && row.playoffOdds != null;
  const ringPct = oddsRing ? row.playoffOdds : pct == null ? null : done ? (myScore > oppScore ? 1 : myScore < oppScore ? 0 : 0.5) : pct;
  // The ring closes all the way only for a result that is certain (won, or YOU WIN = locked in); a near-certain percentage stops just short.
  const ringStyle = ringPct == null ? undefined : { "--win": ringPct >= 0.995 ? (done || lock === "win" || oddsRing ? 1 : 0.985) : Math.max(0.02, ringPct) };
  const alerts = row.outStarters.length;
  const myLeft = mine ? mine.players.filter((p) => p.outlook.state === "pre" || p.outlook.state === "in" || p.outlook.state === null) : [];
  const oppLeft = opp ? opp.yetToPlay + opp.playing : 0;
  // Only "Live" and "Final" -- the next kickoff is on the Playing now panel's countdown, not repeated on every card.
  const status = done ? "Final" : playing ? "Live" : null;
  const hasMatchup = !s.isBye && s.opponent;

  return (
    <div
      className={`sb-card is-${st.key}${sealedClass(st.label)}${ringStyle ? " has-ring" : ""}${oddsRing ? ` ring-${oddsTone(row.playoffOdds)}` : ""}`}
      style={ringStyle}
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
              {pct != null && !done && !lock && <span className="sb-card-pct mono">{formatWin(pct)} to win</span>}
            </div>
          ) : (
            <div className="sb-card-verdict">
              <span className="sb-card-word sb-muted">{s.bestBall ? "Best ball" : "—"}</span>
              {s.bestBall && <span className="sb-card-pct mono">Best lineup from every player&apos;s points</span>}
            </div>
          )}

          <div className="sb-card-scores">
            <div className="sb-card-side is-me">
              <span className="sb-card-team" title="Your team">{row.team}</span>
              <Score value={myScore} state={leadState(myScore, oppScore)[0]} />
            </div>
            <div className="sb-card-side">
              <span className="sb-card-team sb-muted">{row.opponent}</span>
              <Score value={oppScore} state={leadState(myScore, oppScore)[1]} />
            </div>
          </div>

          <div className="sb-card-foot">
            {done ? (
              <span className="sb-card-final sb-muted">All games final</span>
            ) : !s.h2h ? null : ( // best ball has no lineups to say who is left; the card leans on its totals and playoff odds
              // Who is still to play, as two aligned rows: yours as name chips (a red dot on anyone playing right now),
              // theirs as a count.
              <div className="sb-card-todo" title="Starters still to play or playing now">
                <span className="sb-card-label sb-card-todo-head">Still to play</span>
                <span className="sb-card-who mono">Yours</span>
                <span className="sb-card-chips">
                  {myLeft.length > 0 ? (
                    myLeft.map((p) => (
                      <span key={p.id} className={`sb-card-chip${p.outlook.state === "in" ? " is-live" : ""}`}>
                        {shortName(p.name)}
                      </span>
                    ))
                  ) : (
                    <span className="sb-muted">All done</span>
                  )}
                </span>
                <span className="sb-card-who mono">Theirs</span>
                <span className="sb-card-chips">
                  <span className="sb-muted">{oppLeft > 0 ? `${oppLeft} ${oppLeft === 1 ? "player" : "players"}` : "All done"}</span>
                </span>
              </div>
            )}
            {(row.playoffOdds != null || alerts > 0) && (
              <span className="sb-card-extras">
                {row.playoffOdds != null ? (
                  <span className={`sb-card-odds mono ${oddsTone(row.playoffOdds)}`} title="Chance to make the playoffs">
                    Playoffs {formatOdds(row.playoffOdds, row.playoffSettled)}
                  </span>
                ) : (
                  <span />
                )}
                {alerts > 0 && (
                  <span className="sb-card-alerts mono" title={row.outStarters.map((p) => `${p.name}: ${p.status}`).join("\n")}>
                    {alerts} {alerts === 1 ? "alert" : "alerts"}
                  </span>
                )}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FeedRow({ r, isNew, delta, showLeagues, focused, onPick }) {
  const where =
    r.side === "theirs"
      ? r.starts.map((x) => (showLeagues ? x.league : null)).filter(Boolean)
      : r.starts.map((x) => (r.pts === r.ptsMin ? x.league : `${x.league} ${fmt2(x.pts)}`));
  return (
    <li className={`sb-feed-row is-${r.side}${isNew ? " is-new" : ""}${focused ? " is-focus" : ""}`}>
      <div className="sb-feed-who">
        <button type="button" className="sb-feed-name sb-name-btn" aria-pressed={focused} title={focused ? "Showing only his plays -- click to show everyone's" : "Show only his plays"} onClick={() => onPick(r.playerId, r.name)}>
          {r.name}
        </button>
        <span className="sb-feed-sub">
          <PositionBadge position={r.pos} />
          <TeamBadge team={r.team} />
          <span className="h2h-game mono">{r.detail || "Live"}</span>
        </span>
        {showLeagues && where.length > 0 && <span className="sb-feed-leagues">{where.join(" · ")}</span>}
      </div>
      <div className="sb-feed-nums">
        <span className="sb-feed-pts mono">{fmt2(r.pts)}</span>
        {isNew && delta > 0 ? (
          <span className="sb-feed-delta mono">+{fmt2(delta)}</span>
        ) : r.pending ? (
          <span className="sb-feed-delta mono" title="Points from plays Sleeper has not posted yet (already included in the score). It goes away when Sleeper catches up.">
            {r.pending > 0 ? "+" : "−"}{fmt2(Math.abs(r.pending))}
          </span>
        ) : (
          <span className="sb-feed-proj mono">proj {fmt1(r.proj)}</span>
        )}
      </div>
    </li>
  );
}

// One play: who (gold = yours, blue = your opponents'), what happened in plain words, and when. Touchdowns stand out.
function PlayRow({ e, isNew, focusId, onPick }) {
  return (
    <li className={`sb-play is-${e.side}${e.td ? " is-td" : ""}${e.td || e.big ? " is-hot" : ""}${isNew ? " is-new" : ""}`}>
      <div className="sb-play-main">
        <span className="sb-play-who">
          {e.who.map((w) => (
            <span key={w.playerId} className="sb-play-player">
              <TeamBadge team={w.team} />
              <button type="button" className={`sb-play-name sb-name-btn is-${w.side}${w.playerId === focusId ? " is-focus" : ""}`} aria-pressed={w.playerId === focusId} title={w.playerId === focusId ? "Showing only his plays -- click to show everyone's" : "Show only his plays"} onClick={() => onPick(w.playerId, w.name)}>
                {w.name}
              </button>
            </span>
          ))}
        </span>
        <span className="sb-play-what">
          <strong>{e.label}</strong>
          {e.yards && <> · {e.yards}</>}
        </span>
      </div>
      <span className="sb-play-side">
        {e.points !== 0 && (
          <span className={`sb-play-pts mono${e.points < 0 ? " neg" : ""}`} title="Fantasy points this play added (standard PPR rates; your league's own scoring can differ a little)">
            {e.points > 0 ? "+" : "−"}
            {Math.abs(e.points).toFixed(2)}
          </span>
        )}
        <span className="sb-play-when mono">{e.when}</span>
      </span>
    </li>
  );
}

// The panel's right half: every play that moves a fantasy score by the players listed beside it (yours, your opponents', or both -- the buttons under the title), newest first (lib/playByPlay.js via the
// getLivePlays action), refreshed with every 30-second poll. Plays new since the last refresh flash once.
function RecentPlays({ rows, updatedAt, focus, onPick, onTotals }) {
  // The request is keyed on who is listed (and the poll time), so it re-runs exactly when either changes.
  const req = JSON.stringify(
    rows.map((r) => ({ playerId: r.playerId, name: r.name, pos: r.pos, team: r.team, side: r.side })).sort((a, b) => `${a.side}${a.playerId}`.localeCompare(`${b.side}${b.playerId}`)),
  );
  const [state, setState] = useState({ list: [], fresh: new Set(), loaded: false });
  // The plays are re-read every 10 seconds while someone is on the field (the 15-second score poll alone made the totals trail the play list);
  // each read is one small cached request, and the plays also drive the 'ahead of Sleeper' points on every number on the board.
  const [tick, setTick] = useState(0);
  const anyone = rows.length > 0;
  useEffect(() => {
    if (!anyone) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, [anyone]);
  useEffect(() => {
    let cancelled = false;
    getLivePlays(JSON.parse(req))
      .then((res) => {
        if (cancelled || !res?.plays) return;
        onTotals?.(res.totals || {});
        setState((prev) => {
          const before = new Set(prev.list.map((e) => e.id));
          return { list: res.plays, fresh: prev.loaded ? new Set(res.plays.filter((e) => !before.has(e.id)).map((e) => e.id)) : new Set(), loaded: true };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [req, updatedAt, tick, onTotals]);
  // Until a new answer arrives (e.g. right after opening one league), only show plays by players still listed.
  const listed = new Set(rows.map((r) => `${r.side}:${r.playerId}`));
  const everyPlay = state.list.filter((e) => e.who.some((w) => listed.has(`mine:${w.playerId}`) || listed.has(`theirs:${w.playerId}`)));
  // Whose plays: yours, your opponents', or both. A play with a player who is yours in one league and theirs in another
  // (side "both") counts for either.
  const [whose, setWhose] = useState("both");
  const bySide = whose === "both" ? everyPlay : everyPlay.filter((e) => e.side === whose || e.side === "both");
  // Clicking a name (here or in the list beside it) narrows the plays to that player; clicking him again, or the chip, clears it.
  const list = focus ? bySide.filter((e) => e.who.some((w) => w.playerId === focus.playerId)) : bySide;
  return (
    <section className="sb-plays" aria-label="Recent plays">
      <h3 className="sb-feed-label sb-plays-label mono">
        <span>Recent plays</span>
        <span className="sb-feed-sum">every play that moves a score</span>
      </h3>
      <div className="sb-plays-filter" role="group" aria-label="Whose plays">
        {[
          ["mine", "My players", "Mine"],
          ["theirs", "Opponents", "Theirs"],
          ["both", "Both", "Both"],
        ].map(([k, label, short]) => (
          <button key={k} type="button" className={`is-${k}`} aria-pressed={whose === k} aria-label={label} onClick={() => setWhose(k)}>
            <span className="long">{label}</span>
            <span className="short">{short}</span>
          </button>
        ))}
      </div>
      {focus && (
        <button type="button" className="sb-focus-chip mono" onClick={() => onPick(focus.playerId, focus.name)} title="Show everyone's plays again">
          {focus.name} <span aria-hidden="true">✕</span>
        </button>
      )}
      <div className="sb-plays-scroll">
        {list.length > 0 ? (
          <ol className="sb-feed-list">
            {list.map((e) => (
              <PlayRow key={e.id} e={e} isNew={state.fresh.has(e.id)} focusId={focus?.playerId} onPick={onPick} />
            ))}
          </ol>
        ) : (
          <p className="sb-muted sb-feed-empty">{state.loaded ? (focus ? `No plays from ${focus.name} yet.` : "No plays from these players yet.") : "Loading plays…"}</p>
        )}
      </div>
      <p className="sb-plays-note mono">Plays are ESPN&apos;s, scores are Sleeper&apos;s. A play ESPN credits to another player is missing here but counted in the score.</p>
    </section>
  );
}

// The live panel beside the cards: only players on the field right now -- yours, then your opponents' -- across every
// league, or just the open league's two lineups (teamId). Newest scoring first within each side; a row flashes gold
// with "+6.4" when he scores. Finished and not-started players stay off it so it never fills with noise.
function LiveFeed({ savedTeams, gameStates, updatedAt, teamId = null, league = null, playTotals, onTotals, injuriesByTeam, weekFeed }) {
  const mounted = useMounted();
  const baseFeed = useMemo(() => buildLiveFeed(savedTeams, gameStates, { onlyTeamId: teamId }), [savedTeams, gameStates, teamId]);
  // Each player's running points play by play (from the plays request below): Sleeper trails the game by a minute or two, so the
  // plays it hasn't posted yet are added to his number (lib/liveFeed.js pendingFor / applyPending).
  const feed = useMemo(() => ({ ...baseFeed, mine: applyPending(baseFeed.mine, playTotals), theirs: applyPending(baseFeed.theirs, playTotals) }), [baseFeed, playTotals]);
  const all = useMemo(() => [...feed.mine, ...feed.theirs], [feed]);
  const key = all.map((r) => `${r.id}:${r.pts}`).join(",");
  // Points history across polls (React's "adjust state while rendering" pattern: only runs when the points change).
  const [track, setTrack] = useState({ key: null, t: null, stamp: 0 });
  if (track.key !== key) {
    const stamp = updatedAt || track.stamp + 1;
    setTrack({ key, t: trackScoring(track.t, all, stamp), stamp });
  }
  const t = track.t || { changedAt: {}, delta: {} };
  // The "just scored" flash lasts ~10 seconds, then the row goes back to normal (it used to stay lit until anyone's points changed).
  const [flashDone, setFlashDone] = useState(0);
  useEffect(() => {
    if (!track.stamp) return undefined;
    const id = setTimeout(() => setFlashDone(track.stamp), 10000);
    return () => clearTimeout(id);
  }, [track.stamp]);
  const isNew = (r) => Boolean(t.changedAt[r.id] && t.changedAt[r.id] === track.stamp && flashDone !== track.stamp);
  const showLeagues = teamId == null;
  // One player picked by clicking his name (here or in the plays): the plays list narrows to him. Dropped when he leaves the field.
  const [pickedPlayer, setPickedPlayer] = useState(null);
  const focus = pickedPlayer && all.some((r) => r.playerId === pickedPlayer.playerId) ? pickedPlayer : null;
  const pick = (playerId, name) => setPickedPlayer((f) => (f?.playerId === playerId ? null : { playerId, name }));
  const section = (rows, side, label, total) =>
    rows.length > 0 && (
      <section className={`sb-feed-section is-${side}`}>
        <h3 className="sb-feed-label mono">
          <span>{label}</span>
        </h3>
        <ol className="sb-feed-list">
          {sortFeed(rows, t.changedAt).map((r) => (
            <FeedRow key={r.id} r={r} isNew={isNew(r)} delta={t.delta[r.id]} showLeagues={showLeagues} focused={focus?.playerId === r.playerId} onPick={pick} />
          ))}
        </ol>
      </section>
    );
  const nobody = feed.mine.length + feed.theirs.length === 0;
  // The pane is the board's companion: the live list while games are on (with a Companion tab beside it), the companion's cards
  // the rest of the week. A tab picked by hand holds until nobody is on the field any more.
  const [picked, setPicked] = useState(null);
  const mode = nobody ? "companion" : picked || "live";
  return (
    <aside className="sb-feed glass-panel" aria-label="Companion">
      <div className="sb-feed-head">
        <h2 className="board-panel-title">
          {all.length > 0 && <span className="sb-live-dot" aria-hidden="true" />}
          {mode === "live" ? "Playing now" : "Companion"}
        </h2>
        {!nobody && (
          <span className="sb-feed-tabs">
            <PanelTabs tabs={[["live", "Live"], ["companion", "Companion"]]} value={mode} onChange={setPicked} />
          </span>
        )}
        {nobody && league && <span className="sb-feed-scope mono">{league}</span>}
      </div>
      {mode === "companion" ? (
        <Companion savedTeams={savedTeams} gameStates={gameStates} teamId={teamId} injuriesByTeam={injuriesByTeam} weekFeed={weekFeed} />
      ) : (
        // Split lengthwise: who is on the field (left) beside what they just did (right), each scrolling on its own.
        <div className="sb-feed-split">
          <div className="sb-feed-scroll">
            {section(feed.mine, "mine", "Yours", feed.mineTotal)}
            {section(feed.theirs, "theirs", teamId ? "Theirs" : "Your opponents'", feed.theirsTotal)}
          </div>
          <RecentPlays rows={all} updatedAt={updatedAt} focus={focus} onPick={pick} onTotals={onTotals} />
        </div>
      )}
    </aside>
  );
}

// The full-screen game-day layout (My Team's theater, default on game days): a card per league and one running list
// of who is on the field right now. Clicking a card slides that league's head-to-head matchup in from the left over the
// cards, and the live panel narrows to that league. Keyboard: j / k or the arrow keys move between cards, Enter opens
// one, Esc goes back to all leagues (a second Esc leaves full screen). The open league is remembered per browser, so a
// reload lands back on the same matchup.
export default function SundayBoard({ savedTeams, gameStates, injuriesByTeam, updatedAt, toolbar, weekFeed = null }) {
  const mounted = useMounted();
  const [openId, setOpenIdState] = useState(null);
  // Each player's running points play by play (from the plays request in the live panel): shared by the live list and the open matchup.
  const [playTotals, setPlayTotals] = useState(null);
  // New totals are merged into what is already known: opening one league narrows the plays request to its players, and the other leagues' cards
  // must not lose their adjustment (and flicker back to Sleeper's older number) when the board widens again. A stale entry is harmless:
  // lib/liveFeed.js pendingFor only uses it when Sleeper's number still lines up with it.
  const mergeTotals = useCallback((t) => setPlayTotals((prev) => ({ ...(prev || {}), ...t })), []);
  // Which of the open league's views is showing (Matchup / Standings / Best available); opening a league starts on Matchup.
  const [panelTab, setPanelTab] = useState("matchup");
  // League filters (BoardFilters.js): league type / win chance / score / playoff odds. Not remembered between visits, so the
  // board always opens showing every league; the pill and the "Showing N of M" line say when something is filtered.
  const [filters, setFilters] = useState(emptyFilters);
  const factsById = useMemo(() => {
    const m = {};
    for (const t of savedTeams) {
      const ms = matchupState(t, gameStates, injuriesByTeam?.[t.id], playTotals);
      m[t.id] = leagueFacts({ settings: ms.s, standingLabel: ms.st.label, myScore: ms.myScore, oppScore: ms.oppScore, odds: ms.s.playoffOdds ?? null, settled: Boolean(ms.s.playoffSettled) });
    }
    return m;
  }, [savedTeams, gameStates, injuriesByTeam, playTotals]);
  const visibleTeams = useMemo(() => savedTeams.filter((t) => matchesFilters(filters, factsById[t.id])), [savedTeams, filters, factsById]);
  const filtered = filterCount(filters) > 0;
  const openTeam = openId ? savedTeams.find((t) => t.id === openId) : null;
  const gridRef = useRef(null);
  const lastCard = useRef(null);

  function setOpenId(id) {
    setPanelTab("matchup");
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

  // The week's one sentence, built from the SAME words the cards use (lib/standing.js) so the two always agree: how many leagues
  // are won / being won, favored, a toss-up, underdog or lost, plus best-ball leagues (no head-to-head) and lineup alerts.
  const tally = { won: 0, winning: 0, favored: 0, tossup: 0, underdog: 0, losing: 0, lost: 0, bestBall: 0 };
  let alerts = 0;
  let live = 0; // leagues where one of my players is on the field right now (the "Live" label beside the clock)
  for (const t of visibleTeams) {
    const ms = matchupState(t, gameStates, injuriesByTeam?.[t.id], playTotals);
    const label = ms.st.label;
    if (label === "Won") tally.won++;
    else if (label === "You win") tally.winning++;
    else if (label === "Favored") tally.favored++;
    else if (label === "Toss-up") tally.tossup++;
    else if (label === "Underdog") tally.underdog++;
    else if (label === "Out of reach") tally.losing++;
    else if (label === "Lost") tally.lost++;
    else if (t.settings?.bestBall) tally.bestBall++;
    alerts += ms.row.outStarters.length;
    for (const p of t.settings?.h2h?.mine || []) if (gameStates?.[p.team]?.state === "in") { live++; break; }
  }
  const week = savedTeams.find((t) => t.settings?.week)?.settings.week;
  const time = updatedAt && mounted ? new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const parts = [];
  if (tally.won) parts.push(`${tally.won} won`);
  if (tally.winning) parts.push(`${tally.winning} winning`);
  if (tally.favored) parts.push(`${tally.favored} favored`);
  if (tally.tossup) parts.push(`${tally.tossup} toss-up`);
  if (tally.underdog) parts.push(`${tally.underdog} underdog`);
  if (tally.losing) parts.push(`${tally.losing} losing`);
  if (tally.lost) parts.push(`${tally.lost} lost`);
  if (tally.bestBall) parts.push(`${tally.bestBall} best ball`);
  if (alerts) parts.push(`${alerts} lineup ${alerts === 1 ? "alert" : "alerts"}`);

  return (
    <div className="sb">
      <div className={`sb-top${openTeam ? " has-drawer" : ""}`}>
        {/* Same two columns as the body below: the week and its summary with the Filter at the right end of the cards'
            column, then the clock and board controls over the live panel. */}
        <div className="sb-top-main">
          <div className="sb-heading">
            <h2 className="sb-title">Week {week ?? "—"}</h2>
            <p className="sb-summary">{parts.join(" · ") || `${savedTeams.length} leagues`}</p>
          </div>
          {!openTeam && savedTeams.length > 1 && (
            <div className="sb-filterbar">
              {filtered && (
                <span className="sb-filterbar-note mono">
                  Showing {visibleTeams.length} of {savedTeams.length} leagues
                </span>
              )}
              <BoardFilters filters={filters} onChange={setFilters} factsList={Object.values(factsById)} shown={visibleTeams.length} total={savedTeams.length} />
            </div>
          )}
        </div>
        <div className="sb-top-side">
          {time && (
            <span className={`sb-updated mono${live ? " is-live" : ""}`} title="Scores refresh every 30 seconds">
              {live > 0 && <span className="sb-live-dot" aria-hidden="true" />}
              {live > 0 ? "Live" : "Updated"} · {time}
            </span>
          )}
          {toolbar}
        </div>
      </div>
      <div className={`sb-body${openTeam ? " has-drawer" : ""}`}>
        {openTeam ? (
          // The league's matchup slides in from the left over the cards; the live panel stays beside it, narrowed to
          // this league's two lineups.
          <section className="sb-drawer glass-panel" aria-label={`${openTeam.league_name} matchup`}>
            <div className="sb-drawer-head">
              <button type="button" className="sb-drawer-back mono" onClick={() => setOpenId(null)} title="Back to all leagues (Esc)">
                <span aria-hidden="true">←</span> All leagues
              </button>
              <h2 className="board-panel-title">{openTeam.league_name}</h2>
              <span className="sb-drawer-tabs">
                <PanelTabs tabs={leagueTabs(openTeam)} value={panelTab} onChange={setPanelTab} />
              </span>
            </div>
            <MatchupPanel team={openTeam} gameStates={gameStates} tab={panelTab} playTotals={playTotals} injuries={injuriesByTeam?.[openTeam.id]} />
          </section>
        ) : (
          <div className="sb-main">
            <div className="sb-grid" ref={gridRef}>
              {visibleTeams.map((t) => (
                <LeagueCard key={t.id} team={t} gameStates={gameStates} injuries={injuriesByTeam?.[t.id]} onOpen={setOpenId} playTotals={playTotals} />
              ))}
              {visibleTeams.length === 0 && (
                <div className="sb-grid-empty">
                  <p>No leagues match these filters.</p>
                  <button type="button" className="theater-badge-filter-clear" onClick={() => setFilters(emptyFilters())}>
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <LiveFeed
          savedTeams={openTeam ? savedTeams : visibleTeams}
          gameStates={gameStates}
          updatedAt={updatedAt}
          teamId={openTeam ? openTeam.id : null}
          league={openTeam ? openTeam.league_name : null}
          playTotals={playTotals}
          onTotals={mergeTotals}
          injuriesByTeam={injuriesByTeam}
          weekFeed={weekFeed}
        />
      </div>
    </div>
  );
}
