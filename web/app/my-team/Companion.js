"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { useMounted } from "./useMounted";
import { getWaiverWire } from "./actions";
import { buildInsights } from "@/lib/companion";
import { buildLiveFeed, formatCountdown } from "@/lib/liveFeed";

// The Game Board's right-hand pane when nobody is on the field (and its "Companion" tab while games are on): a status strip
// (next kickoff with a countdown, or what state the week is in), one spotlight card that turns over every few seconds, and the
// whole list of what the numbers are saying right now -- swing players, lineup holes, the best pickups, who decided each
// matchup, the playoff picture. lib/companion.js writes the cards (rules over the board's own data, recomputed on every
// poll); this file only shows them.

const SPOTLIGHT_MS = 12000;
const WAIVER_REFRESH_MS = 5 * 60 * 1000;
const WAIVER_KEEP = 8;

// Best available per league, read once and then every five minutes while the pane is mounted (server action getWaiverWire; free
// accounts get the same gated list the Best available tab shows). Kept at module level so switching tabs doesn't re-read it.
const waiverCache = new Map();
function useWaivers(savedTeams) {
  const [waivers, setWaivers] = useState(() => Object.fromEntries([...waiverCache].filter(([k]) => !k.startsWith("at:"))));
  const ids = savedTeams.filter((t) => !t.settings?.bestBall && !t.settings?.isBye).slice(0, 8).map((t) => t.id).join(",");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      for (const id of ids.split(",").filter(Boolean)) {
        const cached = waiverCache.get(`at:${id}`);
        if (cached && Date.now() - cached < WAIVER_REFRESH_MS) continue;
        const res = await getWaiverWire(id).catch(() => null);
        if (!alive) return;
        if (res && !res.error) {
          waiverCache.set(id, res.players.slice(0, WAIVER_KEEP).map((p) => ({ name: p.name, pos: p.pos, team: p.team, proj: p.proj })));
          waiverCache.set(`at:${id}`, Date.now());
          setWaivers(Object.fromEntries([...waiverCache].filter(([k]) => !k.startsWith("at:"))));
        }
      }
    };
    const first = setTimeout(load, 300);
    const t = setInterval(load, WAIVER_REFRESH_MS);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [ids]);
  return waivers;
}

const kickoffLabel = (iso) => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

const PHASE_LINE = {
  preview: "Before kickoff",
  live: "Games on",
  between: "Between games",
  recap: "All games played",
  off: "Off day",
  unknown: "Connecting",
};

function Strip({ phase, feed, week, oneLeague }) {
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
  const games = feed.nextUp?.games || [];
  return (
    <div className="cp-strip">
      <div className="cp-orbit" aria-hidden="true">
        <div className={`sb-wait-orbit${feed.nextStart || phase === "live" ? "" : " is-still"}`}>
          <span className="sb-wait-core" />
        </div>
      </div>
      <div className="cp-strip-text">
        <span className="cp-strip-eyebrow mono">{week ? `Week ${week} · ` : ""}{PHASE_LINE[phase] || ""}</span>
        <div className="cp-strip-grid">
          {feed.nextStart ? (
            <>
              <div className="cp-stat">
                <span className="cp-strip-label mono">Next kickoff</span>
                <span className="cp-strip-time">{mounted ? kickoffLabel(feed.nextStart) : "\u00a0"}</span>
              </div>
              <div className="cp-stat">
                <span className="cp-strip-label mono">Kickoff in</span>
                <span className="cp-strip-clock mono">{now ? formatCountdown(new Date(feed.nextStart).getTime() - now) : "\u00a0"}</span>
              </div>
            </>
          ) : (
            <div className="cp-stat">
              <span className="cp-strip-label mono">
                {oneLeague ? "Everyone in this matchup" : "Everyone"} {phase === "recap" ? "has played" : phase === "live" ? "is in action" : "is waiting"}
              </span>
              <span className="cp-strip-time">{phase === "live" ? "Games in progress" : phase === "recap" ? "That's a wrap" : "Nothing on the field"}</span>
            </div>
          )}
        </div>
        {games.length > 0 && (
          <div className="cp-strip-games">
            <span className="cp-strip-label mono">{games.length === 1 ? "Matchup" : "Games"}</span>
            {games.slice(0, 3).map((g) => (
              <span key={g.join("-")} className="sb-wait-game">
                {g.map((t, i) => (
                  <span key={t} className="sb-wait-team">
                    {i > 0 && <span className="sb-wait-vs mono">at</span>}
                    <TeamBadge team={t} />
                  </span>
                ))}
              </span>
            ))}
            {games.length > 3 && <span className="sb-wait-more mono">+{games.length - 3} more</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ c, spot, fresh }) {
  return (
    <li className={`cp-card is-${c.tone}${spot ? " is-spot" : ""}${fresh ? " is-fresh" : ""}`}>
      <span className="cp-label mono">
        {c.label}
        {c.league ? <span className="cp-league"> · {c.league}</span> : null}
        {fresh && <span className="cp-new"> New</span>}
      </span>
      <h3 className="cp-title">{c.title}</h3>
      <p className="cp-body">{c.body}</p>
      {c.player && (
        <span className="cp-player">
          <PositionBadge position={c.player.pos} />
          {c.player.team && <TeamBadge team={c.player.team} />}
        </span>
      )}
    </li>
  );
}

export default function Companion({ savedTeams, gameStates, teamId = null, injuriesByTeam = null, weekFeed = null }) {
  const teams = useMemo(() => (teamId ? savedTeams.filter((t) => t.id === teamId) : savedTeams), [savedTeams, teamId]);
  const waivers = useWaivers(teams);
  // Today's card needs the viewer's clock, so it appears after mount (the server's clock would mismatch) and moves on at midnight.
  const [today, setToday] = useState(null);
  useEffect(() => {
    const tick = () => setToday((d) => {
      const n = new Date();
      return d && d.toDateString() === n.toDateString() ? d : n;
    });
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  // The week's moves are built for the viewer's saved teams in the order they were saved; one open league uses its own slice.
  const teamIndex = teamId ? savedTeams.findIndex((t) => t.id === teamId) : null;
  const { phase, cards } = useMemo(
    () => buildInsights({ savedTeams: teams, gameStates, waivers, injuriesByTeam, feed: weekFeed, teamIndex: teamIndex >= 0 ? teamIndex : null, now: today }),
    [teams, gameStates, waivers, injuriesByTeam, weekFeed, teamIndex, today],
  );
  const feed = useMemo(() => buildLiveFeed(teams, gameStates), [teams, gameStates]);
  const week = teams.find((t) => t.settings?.week)?.settings.week;

  // Spotlight: turns over the strongest few cards; hovering the pane holds it.
  const [spot, setSpot] = useState(0);
  const [hold, setHold] = useState(false);
  const top = cards.slice(0, 6);
  useEffect(() => {
    if (hold || top.length < 2) return undefined;
    const id = setInterval(() => setSpot((i) => i + 1), SPOTLIGHT_MS);
    return () => clearInterval(id);
  }, [hold, top.length]);
  const current = top.length ? top[spot % top.length] : null;

  // A card that wasn't there on the last poll says "New" for ~15 seconds (never on the first paint).
  const seen = useRef(null);
  const [freshIds, setFreshIds] = useState(() => new Set());
  const ids = cards.map((c) => c.id).join("|");
  useEffect(() => {
    const now = new Set(cards.map((c) => c.id));
    if (seen.current) {
      const added = [...now].filter((id) => id !== "today" && !seen.current.has(id)); // today's card joins after mount, not news
      if (added.length) {
        setFreshIds(new Set(added));
        const t = setTimeout(() => setFreshIds(new Set()), 15000);
        seen.current = now;
        return () => clearTimeout(t);
      }
    }
    seen.current = now;
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return (
    <div className="cp" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
      <Strip phase={phase} feed={feed} week={week} oneLeague={teamId != null} />
      {current ? (
        <div className="cp-scroll">
          <div className="cp-spotlight" key={current.id}>
            <ul className="cp-list">
              <Card c={current} spot fresh={freshIds.has(current.id)} />
            </ul>
            {top.length > 1 && (
              <span className="cp-dots" aria-hidden="true">
                {top.map((c, i) => (
                  <span key={c.id} className={i === spot % top.length ? "on" : ""} />
                ))}
              </span>
            )}
          </div>
          <h3 className="cp-more mono">Everything right now</h3>
          <ul className="cp-list">
            {cards.map((c) => (
              <Card key={c.id} c={c} fresh={freshIds.has(c.id)} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="cp-empty">Nothing to flag yet. This fills in as your lineups, the injury feed and the projections come in.</p>
      )}
    </div>
  );
}
