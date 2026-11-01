"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getGameStats } from "./actions";
import { statChips } from "@/lib/gameStats";
import { normName } from "@/lib/playByPlay";

// Click a player's score in the matchup (or in the Game Board's Playing now list: .sb-feed-row) and the rest of his row (slot, name, badges, outcome curve) slides away from the score while his box-score line
// for this game slides in (lib/gameStats.js, ESPN's box score); click the score again and the line slides out the SAME way while the row slides back in
// from the opposite side -- everything keeps moving in one direction. The loader is a context so the real server action is the default and a preview can
// hand in its own.
export const GameStatsContext = createContext(getGameStats);

const SLIDE_PX = 48; // how far the content drifts while it fades (CSS reads --away * this)
const CLOSE_MS = 400; // a little longer than the CSS slide (.38s)

// enabled: only once his game has started (kickoff -> in progress or final). Returns what the row needs to render the slide.
export function useStatsSlide(p, enabled) {
  const load = useContext(GameStatsContext);
  const [phase, setPhase] = useState("idle"); // idle -> open -> closing -> idle; the closing phase plays the slide-out
  const timer = useRef(null);
  const [ever, setEver] = useState(false); // the panel stays mounted after the first open, so closing can animate
  const [geo, setGeo] = useState(null); // { away: +1 | -1, left, right } -- measured on click, so it works in every layout
  const [line, setLine] = useState(undefined); // undefined = loading, null = no line, object = his stats

  function toggle(e) {
    if (!enabled) return;
    if (phase === "closing") return;
    if (phase === "open") {
      setPhase("closing");
      timer.current = setTimeout(() => setPhase("idle"), CLOSE_MS);
      return;
    }
    const row = e.currentTarget.closest(".h2h-row, .sb-feed-row").getBoundingClientRect();
    const cell = e.currentTarget.getBoundingClientRect();
    // A matchup row sits inside its card's side padding while the score cell bleeds out to the card's edge; the panel runs to that same edge so
    // it is centred between the score's divider and the card's edge (a Playing now row has no side card: edge = row).
    const edge = (e.currentTarget.closest(".h2h-side") || e.currentTarget.closest(".h2h-row, .sb-feed-row")).getBoundingClientRect();
    const scoreOnLeft = cell.left + cell.width / 2 < row.left + row.width / 2;
    // The panel covers the row except the score cell; the old content drifts away from the score.
    setGeo({ away: scoreOnLeft ? 1 : -1, left: scoreOnLeft ? cell.right - row.left + 6 : edge.left - row.left, right: scoreOnLeft ? row.right - edge.right : row.right - cell.left + 6 });
    setEver(true);
    setPhase("open");
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  const open = phase === "open";

  // Loaded when opened, then refreshed while it is open (a live game keeps adding to the line).
  useEffect(() => {
    if (!open) return undefined;
    let dead = false;
    const go = async () => {
      const res = await load([{ name: p.name, team: p.team, pos: p.pos }]).catch(() => null);
      if (!dead) setLine(res?.stats?.[`${p.team}|${normName(p.name)}`] ?? null);
    };
    go();
    const id = setInterval(go, 15000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, [open, p.name, p.team, p.pos, load]);

  return { open, phase, ever, geo, line, toggle, enabled, rowStyle: geo ? { "--away": geo.away, "--slide": `${SLIDE_PX}px` } : undefined };
}

// wrapAt: a list that is tight on room (the Playing now rows) asks for two rows of numbers once there are this many; the matchup rows keep one scaled line.
export function StatsPanel({ p, slide, wrapAt = null }) {
  if (!slide.ever || !slide.geo) return null;
  const chips = statChips(p.pos, slide.line);
  return (
    <div className={`h2h-statsbox${slide.phase === "open" ? " is-in" : slide.phase === "closing" ? " is-out" : " is-idle"}`} style={{ left: slide.geo.left, right: slide.geo.right }} aria-hidden={slide.phase !== "open"}>
      {slide.line === undefined ? (
        <span className="h2h-statsbox-note mono">Loading…</span>
      ) : chips.length === 0 ? (
        <span className="h2h-statsbox-note mono">No box-score line yet.</span>
      ) : (
        <div className={`h2h-stat-chips${wrapAt && chips.length >= wrapAt ? " is-two-rows" : ""}`} style={wrapAt ? { "--cols": chips.length >= wrapAt ? Math.ceil(chips.length / 2) : chips.length } : undefined}>
          {chips.map((c) => (
            <span key={c.label} className="h2h-stat">
              <span className="h2h-stat-label mono">{c.label}</span>
              <span className="h2h-stat-value mono">{c.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
