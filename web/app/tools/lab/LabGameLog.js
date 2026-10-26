"use client";

import { useMemo, useState } from "react";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import { formatMetric } from "@/lib/labMetrics";
import { weeklySeries, niceTicks } from "@/lib/labCalc";
import { useWidth, MetricNotes, tickLabel } from "./labUi";

const M = { l: 48, r: 18, t: 16, b: 40 };
const KINDS = [
  ["pts", "Points"],
  ["xfp", "Expected (xFP)"],
  ["fpoe", "Pts − xFP"],
];

// The picked players' weekly scoring this season, one line each in his colour: points, expected points from his opportunities, or the gap
// between them, optionally as a three-game average. Consecutive weeks are joined with a solid line, a week he didn't play with a dashed one.
// For points, this week's projection is the hollow dot at the end. Below: each player's season so far.
export default function LabGameLog({ picked, week, season }) {
  const [ref, width] = useWidth();
  const [kind, setKind] = useState("pts");
  const [smooth, setSmooth] = useState(false);
  const [hoverWeek, setHoverWeek] = useState(null);

  const lines = useMemo(
    () =>
      picked.map((p) => ({
        p,
        pts: weeklySeries(p.g, kind, smooth),
        proj: kind === "pts" && !smooth && !p.bye && typeof p.m.projection === "number" ? p.m.projection : null,
      })),
    [picked, kind, smooth]
  );
  const any = lines.some((l) => l.pts.length);
  const valueKey = kind === "fpoe" ? "fpoe" : "ppg"; // how a charted value is written (the gap carries its sign)
  const lastWeek = Math.max(week, ...lines.flatMap((l) => l.pts.map((x) => x.week)));
  const vals = lines.flatMap((l) => [...l.pts.map((x) => x.value), ...(l.proj != null ? [l.proj] : [])]);
  const yt = niceTicks(Math.min(0, ...vals), Math.max(1, ...vals), 5);
  const [y0, y1] = [yt[0], yt[yt.length - 1]];
  const H = width && width < 560 ? 300 : 380;
  const sx = (w) => M.l + ((w - 1) / Math.max(1, lastWeek - 1)) * (width - M.l - M.r);
  const sy = (v) => M.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const w = Math.round(1 + ((e.clientX - box.left - M.l) / (width - M.l - M.r)) * (lastWeek - 1));
    setHoverWeek(w >= 1 && w <= lastWeek ? w : null);
  };

  if (!picked.length) return <p className="lab-empty">Add players above to chart their weeks.</p>;

  return (
    <div className="lab-view">
      <div className="lab-controls">
        <div className="lab-field">
          <span className="lab-field-label">Show</span>
          <div className="rk-positions" role="group" aria-label="What to chart">
            {KINDS.map(([k, label]) => (
              <button key={k} type="button" className={kind === k ? "active" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="lab-check">
          <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
          3-game average
        </label>
      </div>

      <div className="lab-chart" ref={ref} style={{ height: H }}>
        {width > 0 && any && (
          <svg
            className="lab-svg"
            width={width}
            height={H}
            role="img"
            aria-label={`Weekly ${KINDS.find((k) => k[0] === kind)[1]} for ${picked.map((p) => p.name).join(", ")}, ${season} season`}
            onPointerMove={onMove}
            onPointerLeave={() => setHoverWeek(null)}
          >
            {yt.map((t) => (
              <g key={`y${t}`}>
                <line className={`lab-grid${t === 0 && y0 < 0 ? " is-zero" : ""}`} x1={M.l} x2={width - M.r} y1={sy(t)} y2={sy(t)} />
                <text className="lab-tick" x={M.l - 8} y={sy(t) + 3.5} textAnchor="end">
                  {tickLabel(valueKey, t)}
                </text>
              </g>
            ))}
            {weeks.map((w) => (
              <text key={`w${w}`} className={`lab-tick${w === week ? " is-now" : ""}`} x={sx(w)} y={H - M.b + 16} textAnchor="middle">
                {lastWeek > 12 && w % 2 === 0 && w !== week ? "" : `W${w}`}
              </text>
            ))}
            <line className="lab-axis" x1={M.l} x2={width - M.r} y1={H - M.b} y2={H - M.b} />
            {hoverWeek && <line className="lab-guide" x1={sx(hoverWeek)} x2={sx(hoverWeek)} y1={M.t} y2={H - M.b} />}
            {lines.map(({ p, pts, proj }) => (
              <g key={p.name} style={{ "--c": p.color }}>
                {pts.slice(1).map((pt, i) => {
                  const prev = pts[i];
                  return (
                    <line
                      key={`s${pt.week}`}
                      className={`lab-line${pt.week - prev.week > 1 ? " is-gap" : ""}`}
                      x1={sx(prev.week)}
                      y1={sy(prev.value)}
                      x2={sx(pt.week)}
                      y2={sy(pt.value)}
                    />
                  );
                })}
                {proj != null && pts.length > 0 && pts[pts.length - 1].week < week && (
                  <>
                    <line className="lab-line is-gap" x1={sx(pts[pts.length - 1].week)} y1={sy(pts[pts.length - 1].value)} x2={sx(week)} y2={sy(proj)} />
                    <circle className="lab-proj" cx={sx(week)} cy={sy(proj)} r={5.5} />
                  </>
                )}
                {pts.map((pt) => (
                  <circle key={`d${pt.week}`} className="lab-point" cx={sx(pt.week)} cy={sy(pt.value)} r={hoverWeek === pt.week ? 5.5 : 3.8} />
                ))}
              </g>
            ))}
          </svg>
        )}
        {width > 0 && !any && <p className="lab-empty">No games logged this season for these players yet.</p>}
        {hoverWeek && any && (
          <div className="lab-tip" style={{ left: Math.min(sx(hoverWeek) + 14, width - 230), top: 8 }} aria-hidden="true">
            <div className="lab-tip-head">
              <b>
                Week {hoverWeek}
                {hoverWeek === week ? " · this week" : ""}
              </b>
            </div>
            {lines.map(({ p, pts, proj }) => {
              const pt = pts.find((x) => x.week === hoverWeek);
              const isProj = !pt && hoverWeek === week && proj != null;
              return (
                <div key={p.name} className="lab-tip-row" style={{ "--c": p.color }}>
                  <span className="lab-tip-player">{p.name}</span>
                  <b>{pt ? `${formatMetric(valueKey, pt.value)}${pt.opp ? ` vs ${pt.opp}` : ""}` : isProj ? `${formatMetric("ppg", proj)} proj.` : "no game"}</b>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="lab-legend">
        {picked.map((p) => (
          <span key={p.name}>
            <i style={{ background: p.color }} />
            {p.name}
          </span>
        ))}
        {kind === "pts" && !smooth && (
          <span>
            <i className="lab-legend-proj" />
            This week&apos;s projection
          </span>
        )}
      </div>

      <div className="lab-table-wrap">
        <table className="lab-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Games</th>
              <th scope="col">Pts/G</th>
              <th scope="col">Last 3</th>
              <th scope="col">Best</th>
              <th scope="col" title="Standard deviation of his weekly points: low = steady, high = boom or bust">Spread</th>
              <th scope="col">xFP/G</th>
              <th scope="col">Pts − xFP/G</th>
              <th scope="col">W{week} Proj.</th>
            </tr>
          </thead>
          <tbody>
            {picked.map((p) => (
              <tr key={p.name} style={{ "--c": p.color }}>
                <th scope="row">
                  <span className="lab-row-player">
                    <i aria-hidden="true" />
                    {p.name}
                    <PositionBadge position={p.pos} />
                    <TeamBadge team={p.team} />
                  </span>
                </th>
                <td>{formatMetric("gp", p.m.gp)}</td>
                <td>{formatMetric("ppg", p.m.ppg)}</td>
                <td>{formatMetric("l3", p.m.l3)}</td>
                <td>{formatMetric("best", p.m.best)}</td>
                <td>{formatMetric("sd", p.m.sd)}</td>
                <td>{formatMetric("avgXfp", p.m.avgXfp)}</td>
                <td>{formatMetric("fpoe", p.m.fpoe)}</td>
                <td>{p.bye ? "Bye" : formatMetric("projection", p.m.projection)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MetricNotes keys={kind === "pts" ? ["ppg", "sd"] : ["avgXfp", "fpoe"]} />
    </div>
  );
}
