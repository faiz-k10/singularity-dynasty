"use client";

import { useId, useMemo, useState } from "react";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import { LAB_METRIC, formatMetric } from "@/lib/labMetrics";
import { linearFit, corrWord, niceTicks, median } from "@/lib/labCalc";
import { useWidth, MetricSelect, MetricNotes, POS_COLOR, shortName, tickLabel, placeLabels, Signature } from "./labUi";

const M = { l: 58, r: 24, t: 16, b: 50 };
const HIT = 22; // how close (px) the pointer must be to a dot to pick it

// Two numbers against each other for every player in the pool: one dot each, the picked players in their colours and labelled, a dashed
// line at each axis's median and, if asked, the least-squares line with its correlation. Hover a dot for the player; click it to add or
// remove him.
export default function LabScatter({ pool, available, simsAccess, colorOf, onToggle, pos, xKey, yKey, onX, onY, onSwap }) {
  const id = useId();
  const [ref, width] = useWidth();
  const [trend, setTrend] = useState(true);
  const [hover, setHover] = useState(null);

  const pts = useMemo(
    () =>
      pool
        .filter((r) => typeof r.m[xKey] === "number" && typeof r.m[yKey] === "number")
        .map((r) => ({ r, x: r.m[xKey], y: r.m[yKey] })),
    [pool, xKey, yKey]
  );
  const fit = useMemo(() => linearFit(pts.map((p) => [p.x, p.y])), [pts]);
  const mx = median(pts.map((p) => p.x));
  const my = median(pts.map((p) => p.y));

  const H = width && width < 560 ? 340 : 460;
  const xt = niceTicks(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)), width < 560 ? 4 : 6);
  const yt = niceTicks(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)), 5);
  const [x0, x1] = [xt[0], xt[xt.length - 1]];
  const [y0, y1] = [yt[0], yt[yt.length - 1]];
  const sx = (v) => M.l + ((v - x0) / (x1 - x0 || 1)) * (width - M.l - M.r);
  const sy = (v) => M.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);

  // Picked players on top of everyone else.
  const order = pts.slice().sort((a, b) => Number(colorOf.has(a.r.name)) - Number(colorOf.has(b.r.name)));
  const near = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    let best = null;
    let bestD = HIT * HIT;
    for (const p of pts) {
      const d = (sx(p.x) - px) ** 2 + (sy(p.y) - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };
  const hovered = hover ? pts.find((p) => p.r.name === hover) : null;
  const xm = LAB_METRIC[xKey];
  const ym = LAB_METRIC[yKey];

  return (
    <div className="lab-view">
      <div className="lab-controls">
        <MetricSelect id={`${id}-x`} label="X axis" value={xKey} onChange={onX} available={available} simsAccess={simsAccess} />
        <button type="button" className="lab-icon-btn" onClick={onSwap} title="Swap the axes" aria-label="Swap the axes">
          ⇄
        </button>
        <MetricSelect id={`${id}-y`} label="Y axis" value={yKey} onChange={onY} available={available} simsAccess={simsAccess} />
        <label className="lab-check">
          <input type="checkbox" checked={trend} onChange={(e) => setTrend(e.target.checked)} />
          Trend line
        </label>
      </div>

      <div className="lab-strip">
        <div>
          <b>{pts.length}</b>
          <span>Players</span>
        </div>
        <div title="Pearson's r: +1 = the dots sit on a rising line, −1 on a falling one, 0 = no straight-line link">
          <b>{fit ? fit.r.toFixed(2) : "—"}</b>
          <span>Correlation r</span>
          {fit && <em>{corrWord(fit.r)}</em>}
        </div>
        <div title="R²: the share of the spread in the Y numbers that a straight line through X accounts for">
          <b>{fit ? `${Math.round(fit.r ** 2 * 100)}%` : "—"}</b>
          <span>Explained (R²)</span>
        </div>
        <div>
          <b>{formatMetric(xKey, mx)}</b>
          <span>Median {xm?.label}</span>
        </div>
        <div>
          <b>{formatMetric(yKey, my)}</b>
          <span>Median {ym?.label}</span>
        </div>
      </div>

      <div className="lab-chart" ref={ref} style={{ height: H }}>
        <Signature axis={M} />
        {width > 0 && pts.length >= 2 && (
          <svg
            className="lab-svg"
            width={width}
            height={H}
            role="img"
            aria-label={`${ym?.label} against ${xm?.label} for ${pts.length} players${fit ? `, correlation ${fit.r.toFixed(2)}` : ""}`}
            onPointerMove={(e) => setHover(near(e)?.r.name ?? null)}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const p = near(e);
              if (p) onToggle(p.r.name);
            }}
            style={{ cursor: hovered ? "pointer" : "default" }}
          >
            <defs>
              <clipPath id={`${id}-plot`}>
                <rect x={M.l} y={M.t} width={width - M.l - M.r} height={H - M.t - M.b} />
              </clipPath>
            </defs>
            {xt.map((t) => (
              <g key={`x${t}`}>
                <line className="lab-grid" x1={sx(t)} x2={sx(t)} y1={M.t} y2={H - M.b} />
                <text className="lab-tick" x={sx(t)} y={H - M.b + 16} textAnchor="middle">
                  {tickLabel(xKey, t)}
                </text>
              </g>
            ))}
            {yt.map((t) => (
              <g key={`y${t}`}>
                <line className="lab-grid" x1={M.l} x2={width - M.r} y1={sy(t)} y2={sy(t)} />
                <text className="lab-tick" x={M.l - 8} y={sy(t) + 3.5} textAnchor="end">
                  {tickLabel(yKey, t)}
                </text>
              </g>
            ))}
            <line className="lab-axis" x1={M.l} x2={width - M.r} y1={H - M.b} y2={H - M.b} />
            <line className="lab-axis" x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} />
            <text className="lab-axis-label" x={(M.l + width - M.r) / 2} y={H - 10} textAnchor="middle">
              {xm?.label}
            </text>
            <text className="lab-axis-label" transform={`translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle">
              {ym?.label}
            </text>

            <g clipPath={`url(#${id}-plot)`}>
              <line className="lab-median" x1={sx(mx)} x2={sx(mx)} y1={M.t} y2={H - M.b} />
              <line className="lab-median" x1={M.l} x2={width - M.r} y1={sy(my)} y2={sy(my)} />
              {trend && fit && (
                <line className="lab-trend" x1={sx(x0)} x2={sx(x1)} y1={sy(fit.slope * x0 + fit.intercept)} y2={sy(fit.slope * x1 + fit.intercept)} />
              )}
              {order.map((p) => {
                const c = colorOf.get(p.r.name);
                return (
                  <circle
                    key={p.r.name}
                    className={`lab-dot${c ? " is-picked" : ""}${hover === p.r.name ? " is-hover" : ""}`}
                    cx={sx(p.x)}
                    cy={sy(p.y)}
                    r={c ? 6.5 : hover === p.r.name ? 5.5 : 4.2}
                    style={{ fill: c || (pos === "ALL" ? POS_COLOR[p.r.pos] : undefined) }}
                  />
                );
              })}
              {placeLabels(
                order
                  .filter((p) => colorOf.has(p.r.name))
                  .map((p) => {
                    const right = sx(p.x) > width - 130;
                    return { id: p.r.name, x: sx(p.x) + (right ? -10 : 10), y: sy(p.y) + 4, text: shortName(p.r.name), anchor: right ? "end" : "start" };
                  })
              ).map((l) => (
                <text key={`l${l.id}`} className="lab-label" x={l.x} y={l.y} textAnchor={l.anchor} style={{ fill: colorOf.get(l.id) }}>
                  {l.text}
                </text>
              ))}
            </g>
          </svg>
        )}
        {width > 0 && pts.length < 2 && <p className="lab-empty">Not enough players have both of these numbers. Try another pair or position.</p>}
        {hovered && (
          <div
            className="lab-tip"
            style={{ left: Math.min(sx(hovered.x) + 14, width - 230), top: Math.max(4, sy(hovered.y) - 70) }}
            aria-hidden="true"
          >
            <div className="lab-tip-head">
              <b>{hovered.r.name}</b>
              <PositionBadge position={hovered.r.pos} />
              <TeamBadge team={hovered.r.team} />
            </div>
            <div className="lab-tip-row">
              <span>{xm?.label}</span>
              <b>{formatMetric(xKey, hovered.x)}</b>
            </div>
            <div className="lab-tip-row">
              <span>{ym?.label}</span>
              <b>{formatMetric(yKey, hovered.y)}</b>
            </div>
            <div className="lab-tip-foot">{colorOf.has(hovered.r.name) ? "Click to remove" : "Click to add"}</div>
          </div>
        )}
      </div>

      <div className="lab-legend">
        {pos === "ALL" &&
          Object.entries(POS_COLOR).map(([p, c]) => (
            <span key={p}>
              <i style={{ background: c }} />
              {p}
            </span>
          ))}
        <span>
          <i className="lab-legend-median" />
          Median
        </span>
        {trend && fit && (
          <span>
            <i className="lab-legend-trend" />
            Trend line
          </span>
        )}
      </div>
      <MetricNotes keys={[xKey, yKey]} />
    </div>
  );
}
