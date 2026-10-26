// A lineup row's projection and live score on one outcome curve (Matchup tab, MatchupPanel.js). The hump is the same
// picture as Weekly Projection Rankings' Outcome Curve (app/tools/OutcomeCurve.js): a blue wedge below the floor, the
// gold floor-to-ceiling hump peaking at the median, a red wedge above the ceiling. Floor, median and ceiling are
// written under it; the points scored so far ride on the curve as a marker -- a dot sitting on the hump with a line
// down to the baseline. The number itself is NOT drawn here: it is the row's own big Pts cell, so the three small range
// numbers can't be mistaken for it. Coloured by the zone it lands in: blue wedge (at or under his floor), plain on the gold hump (his normal
// range, median included), red wedge (at or over his ceiling); a pulse while his game is on. No marker before kickoff.
//
// Geometry is fixed (not scaled to the week's widest range like the table's curve) so every row lines up and the
// three numbers always have room: the labels sit under the floor edge, the peak and the ceiling edge, and the peak is
// kept off the edges for the same reason.
import { useEffect, useRef, useState } from "react";
import { W, H, MARGIN, PEAK_Y, BASE_Y, LABEL_Y, X_FLOOR, hump, curveGeometry, viewWidth, fmt, f1 } from "@/lib/scoreCurve";

// state: "pre" | "in" | "post" (bye / out count as no marker). est = typical range for someone we don't project.
export default function ScoreCurve({ floor, median, ceiling, pts, state, est = false }) {
  // The CSS decides how wide the curve is (up to 182px, or the whole cell when the board's right pane is folded); the drawing follows that width.
  const ref = useRef(null);
  const [px, setPx] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setPx(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const w = viewWidth(px);
  if (![floor, median, ceiling].every((v) => typeof v === "number" && Number.isFinite(v)) || !(ceiling > floor)) return null;
  const { xPeak, tailY, xOf, yAt, xCeil } = curveGeometry(floor, median, ceiling, w);
  const left = hump(xPeak, X_FLOOR).reverse();
  const right = hump(xPeak, xCeil);
  const mid = [...left, ...right.slice(1)];
  const middlePath = `M${fmt(mid[0][0], BASE_Y)} L${mid.map(([x, y]) => fmt(x, y)).join(" L")} L${fmt(mid[mid.length - 1][0], BASE_Y)} Z`;
  const leftTail = `M${fmt(X_FLOOR, BASE_Y)} L${fmt(X_FLOOR, tailY)} L${fmt(MARGIN, BASE_Y)} Z`;
  const rightTail = `M${fmt(xCeil, BASE_Y)} L${fmt(xCeil, tailY)} L${fmt(w - MARGIN, BASE_Y)} Z`;

  const scored = typeof pts === "number" && state !== "pre" && state != null;
  const x = scored ? Math.min(w - MARGIN - 2, Math.max(MARGIN + 2, xOf(pts))) : null;
  const y = scored ? yAt(x) : null;
  // Where the score landed, in the colour of the zone it sits in: the blue wedge (at or under his floor), the gold hump (his
  // normal range -- plain), or the red wedge (at or over his ceiling).
  const zone = !scored ? null : pts <= floor ? "low" : pts >= ceiling ? "good" : "mid";

  const title = [
    `Floor ${f1(floor)} · median ${f1(median)} · ceiling ${f1(ceiling)}${est ? " (typical range for the position -- we don't project this player)" : ""}`,
    scored ? `Scored ${f1(pts)} so far${state === "in" ? " (game in progress)" : ""}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <svg className={`score-curve${est ? " is-est" : ""}${state === "in" ? " is-live" : ""}${zone ? ` zone-${zone}` : ""}`} ref={ref} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={title.replace(/\n/g, ". ")}>
      <path className="outcome-curve-tail-floor" d={leftTail} />
      <path className="outcome-curve-tail-ceiling" d={rightTail} />
      <path className="outcome-curve-middle" d={middlePath} />
      <circle className="score-curve-peak" cx={xPeak} cy={PEAK_Y} r="2" />
      <text className="sc-label sc-floor" x={X_FLOOR} y={LABEL_Y} textAnchor="middle">{f1(floor)}</text>
      <text className="sc-label sc-median" x={xPeak} y={LABEL_Y} textAnchor="middle">{f1(median)}</text>
      <text className="sc-label sc-ceiling" x={xCeil} y={LABEL_Y} textAnchor="middle">{f1(ceiling)}</text>
      {scored && (
        // The marker only: a drop line to the baseline and a dot sitting on the hump. The number is the row's Pts cell.
        <g className="score-curve-marker">
          <line className="score-curve-drop-edge" x1={x} y1={y} x2={x} y2={BASE_Y} />
          <line x1={x} y1={y} x2={x} y2={BASE_Y} />
          <circle className="score-curve-halo" cx={x} cy={y} r="8.5" />
          <circle className="score-curve-dot" cx={x} cy={y} r="4.8" />
        </g>
      )}
    </svg>
  );
}
