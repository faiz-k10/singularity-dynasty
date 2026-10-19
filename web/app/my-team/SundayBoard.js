"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MatchupPanel, { sleeperMatchupUrl, formatWin, standing, PanelTabs, leagueTabs } from "./MatchupPanel";
import { useMounted } from "./useMounted";
import { buildRow, isTyping, moveFocus } from "./LeagueDashboard";
import { formatOdds, oddsTone } from "./Standings";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { summarizeSide } from "@/lib/winChance";
import { buildLiveFeed, trackScoring, sortFeed, formatCountdown } from "@/lib/liveFeed";
import { getLivePlays } from "./actions";
import { leadState } from "@/lib/leadState";

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
              <span className="sb-card-team" title="Your team">{row.team}</span>
              <Score value={myScore} state={leadState(myScore, oppScore)[0]} />
            </div>
            <div className="sb-card-side">
              <span className="sb-card-team sb-muted">{row.opponent}</span>
              <Score value={oppScore} state={leadState(myScore, oppScore)[1]} />
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
                  Playoffs {formatOdds(row.playoffOdds, row.playoffSettled)}
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

function FeedRow({ r, isNew, delta, showLeagues }) {
  const beat = r.proj > 0 && r.pts >= r.proj;
  const where =
    r.side === "theirs"
      ? r.starts.map((x) => (showLeagues ? x.league : null)).filter(Boolean)
      : r.starts.map((x) => (r.pts === r.ptsMin ? x.league : `${x.league} ${fmt1(x.pts)}`));
  return (
    <li className={`sb-feed-row is-${r.side}${isNew ? " is-new" : ""}`}>
      <div className="sb-feed-who">
        <span className="sb-feed-name">{r.name}</span>
        <span className="sb-feed-sub">
          <PositionBadge position={r.pos} />
          <TeamBadge team={r.team} />
          <span className="h2h-game mono">{r.detail || "Live"}</span>
        </span>
        {showLeagues && where.length > 0 && <span className="sb-feed-leagues">{where.join(" · ")}</span>}
      </div>
      <div className="sb-feed-nums">
        <span className={`sb-feed-pts mono${beat ? " beat" : ""}`}>{fmt1(r.pts)}</span>
        {isNew && delta > 0 ? <span className="sb-feed-delta mono">+{fmt1(delta)}</span> : <span className="sb-feed-proj mono">proj {fmt1(r.proj)}</span>}
      </div>
    </li>
  );
}

// One play: who (gold = yours, blue = your opponents'), what happened in plain words, and when. Touchdowns stand out.
function PlayRow({ e, isNew }) {
  return (
    <li className={`sb-play is-${e.side}${e.td ? " is-td" : ""}${isNew ? " is-new" : ""}`}>
      <div className="sb-play-main">
        <span className="sb-play-who">
          {e.who.map((w, i) => (
            <span key={w.playerId}>
              {i > 0 && <span className="sb-play-join">{w.arrow ? " → " : " · "}</span>}
              <span className={`sb-play-name is-${w.side}`}>{w.name}</span>
              {w.note && <span className="sb-play-note"> ({w.note})</span>}
            </span>
          ))}
        </span>
        <span className="sb-play-what">
          <strong>{e.label}</strong>
          {e.yards && <> · {e.yards}</>}
          {e.partner && <span className="sb-play-partner"> · {e.partner}</span>}
        </span>
      </div>
      <span className="sb-play-when mono">{e.when}</span>
    </li>
  );
}

// The panel's right half: the latest scoring plays and 20+ yard gains by the players listed beside it, newest first (lib/playByPlay.js via the
// getLivePlays action), refreshed with every 30-second poll. Plays new since the last refresh flash once.
function RecentPlays({ rows, updatedAt }) {
  // The request is keyed on who is listed (and the poll time), so it re-runs exactly when either changes.
  const req = JSON.stringify(
    rows.map((r) => ({ playerId: r.playerId, name: r.name, pos: r.pos, team: r.team, side: r.side })).sort((a, b) => `${a.side}${a.playerId}`.localeCompare(`${b.side}${b.playerId}`)),
  );
  const [state, setState] = useState({ list: [], fresh: new Set(), loaded: false });
  useEffect(() => {
    let cancelled = false;
    getLivePlays(JSON.parse(req))
      .then((res) => {
        if (cancelled || !res?.plays) return;
        setState((prev) => {
          const before = new Set(prev.list.map((e) => e.id));
          return { list: res.plays, fresh: prev.loaded ? new Set(res.plays.filter((e) => !before.has(e.id)).map((e) => e.id)) : new Set(), loaded: true };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [req, updatedAt]);
  // Until a new answer arrives (e.g. right after opening one league), only show plays by players still listed.
  const listed = new Set(rows.map((r) => `${r.side}:${r.playerId}`));
  const list = state.list.filter((e) => e.who.some((w) => listed.has(`mine:${w.playerId}`) || listed.has(`theirs:${w.playerId}`)));
  return (
    <section className="sb-plays" aria-label="Recent plays">
      <h3 className="sb-feed-label sb-plays-label mono">
        <span>Recent plays</span>
        <span className="sb-feed-sum">scores · 20+ yards</span>
      </h3>
      <div className="sb-plays-scroll">
        {list.length > 0 ? (
          <ol className="sb-feed-list">
            {list.map((e) => (
              <PlayRow key={e.id} e={e} isNew={state.fresh.has(e.id)} />
            ))}
          </ol>
        ) : (
          <p className="sb-muted sb-feed-empty">{state.loaded ? "No scores or 20+ yard plays from these players yet." : "Loading plays…"}</p>
        )}
      </div>
    </section>
  );
}

// What the live panel shows while nobody is on the field: one centred card in the board's language -- a small event
// horizon ring, "Next kickoff", the time in the display font with a countdown, the game(s) as team badges, and how many
// of your (gold) and your opponents' (blue) starters play in them. When nobody has a game left: "That's a wrap".
function BetweenGames({ feed, gameStates, oneLeague }) {
  const mounted = useMounted();
  const [now, setNow] = useState(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const next = feed.nextUp;
  let eyebrow, title, sub;
  if (!gameStates) {
    eyebrow = "Live scoreboard";
    title = "Connecting";
    sub = "Scores refresh every 30 seconds.";
  } else if (feed.nextStart) {
    eyebrow = "Next kickoff";
    title = mounted ? kickoff(feed.nextStart) : "\u00a0";
    sub = now ? formatCountdown(new Date(feed.nextStart).getTime() - now) : "\u00a0";
  } else {
    eyebrow = "Nobody on the field";
    title = "That's a wrap";
    sub = oneLeague ? "Everyone in this matchup has played." : "All your players and your opponents' have played this week.";
  }
  const games = next?.games || [];
  return (
    <div className="sb-wait">
      <div className={`sb-wait-orbit${feed.nextStart ? "" : " is-still"}`} aria-hidden="true">
        <span className="sb-wait-core" />
      </div>
      <span className="sb-wait-eyebrow mono">{eyebrow}</span>
      <span className="sb-wait-title">{title}</span>
      {feed.nextStart ? (
        <div className="sb-wait-count">
          <span className="sb-wait-count-label">Countdown</span>
          <span className="sb-wait-sub mono is-clock">{sub}</span>
        </div>
      ) : (
        <span className="sb-wait-sub mono">{sub}</span>
      )}
      {games.length > 0 && (
        <ul className="sb-wait-games">
          {games.slice(0, 3).map((g) => (
            <li key={g.join("-")} className="sb-wait-game">
              {g.map((t, i) => (
                <span key={t} className="sb-wait-team">
                  {i > 0 && <span className="sb-wait-vs mono">at</span>}
                  <TeamBadge team={t} />
                </span>
              ))}
            </li>
          ))}
          {games.length > 3 && <li className="sb-wait-more mono">+{games.length - 3} more games</li>}
        </ul>
      )}
      {next && next.mine + next.theirs > 0 && (
        <p className="sb-wait-who mono">
          {next.mine > 0 && (
            <span className="is-mine">
              <strong>{next.mine}</strong> of yours
            </span>
          )}
          {next.mine > 0 && next.theirs > 0 && <span className="sb-wait-dot"> · </span>}
          {next.theirs > 0 && (
            <span className="is-theirs">
              <strong>{next.theirs}</strong> of {oneLeague ? "theirs" : "your opponents'"}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

// The live panel beside the cards: only players on the field right now -- yours, then your opponents' -- across every
// league, or just the open league's two lineups (teamId). Newest scoring first within each side; a row flashes gold
// with "+6.4" when he scores. Finished and not-started players stay off it so it never fills with noise.
function LiveFeed({ savedTeams, gameStates, updatedAt, teamId = null, league = null }) {
  const mounted = useMounted();
  const feed = useMemo(() => buildLiveFeed(savedTeams, gameStates, { onlyTeamId: teamId }), [savedTeams, gameStates, teamId]);
  const all = useMemo(() => [...feed.mine, ...feed.theirs], [feed]);
  const key = all.map((r) => `${r.id}:${r.pts}`).join(",");
  // Points history across polls (React's "adjust state while rendering" pattern: only runs when the points change).
  const [track, setTrack] = useState({ key: null, t: null, stamp: 0 });
  if (track.key !== key) {
    const stamp = updatedAt || track.stamp + 1;
    setTrack({ key, t: trackScoring(track.t, all, stamp), stamp });
  }
  const t = track.t || { changedAt: {}, delta: {} };
  const isNew = (r) => Boolean(t.changedAt[r.id] && t.changedAt[r.id] === track.stamp);
  const showLeagues = teamId == null;
  const section = (rows, side, label, total) =>
    rows.length > 0 && (
      <section className={`sb-feed-section is-${side}`}>
        <h3 className="sb-feed-label mono">
          <span>{label}</span>
          <span className="sb-feed-sum">
            {rows.length} on the field · <strong>{fmt1(total)}</strong> pts
          </span>
        </h3>
        <ol className="sb-feed-list">
          {sortFeed(rows, t.changedAt).map((r) => (
            <FeedRow key={r.id} r={r} isNew={isNew(r)} delta={t.delta[r.id]} showLeagues={showLeagues} />
          ))}
        </ol>
      </section>
    );
  const nobody = feed.mine.length + feed.theirs.length === 0;
  return (
    <aside className="sb-feed glass-panel" aria-label="Playing now">
      <div className="sb-feed-head">
        <h2 className="board-panel-title">
          {all.length > 0 && <span className="sb-live-dot" aria-hidden="true" />}
          Playing now
        </h2>
        {league && <span className="sb-feed-scope mono">{league}</span>}
      </div>
      {nobody ? (
        <BetweenGames feed={feed} gameStates={gameStates} oneLeague={teamId != null} />
      ) : (
        // Split lengthwise: who is on the field (left) beside what they just did (right), each scrolling on its own.
        <div className="sb-feed-split">
          <div className="sb-feed-scroll">
            {section(feed.mine, "mine", "Yours", feed.mineTotal)}
            {section(feed.theirs, "theirs", teamId ? "Theirs" : "Your opponents'", feed.theirsTotal)}
          </div>
          <RecentPlays rows={all} updatedAt={updatedAt} />
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
export default function SundayBoard({ savedTeams, gameStates, injuriesByTeam, updatedAt, toolbar }) {
  const mounted = useMounted();
  const [openId, setOpenIdState] = useState(null);
  // Which of the open league's views is showing (Matchup / Standings / Best available); opening a league starts on Matchup.
  const [panelTab, setPanelTab] = useState("matchup");
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
            <MatchupPanel team={openTeam} gameStates={gameStates} tab={panelTab} />
          </section>
        ) : (
          <div className="sb-grid" ref={gridRef}>
            {savedTeams.map((t) => (
              <LeagueCard key={t.id} team={t} gameStates={gameStates} injuries={injuriesByTeam?.[t.id]} onOpen={setOpenId} />
            ))}
          </div>
        )}
        <LiveFeed
          savedTeams={savedTeams}
          gameStates={gameStates}
          updatedAt={updatedAt}
          teamId={openTeam ? openTeam.id : null}
          league={openTeam ? openTeam.league_name : null}
        />
      </div>
    </div>
  );
}
