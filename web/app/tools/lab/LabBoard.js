"use client";

import { useId, useMemo, useState } from "react";
import PositionBadge from "../PositionBadge";
import TeamBadge from "../TeamBadge";
import { LAB_METRIC, formatMetric } from "@/lib/labMetrics";
import { mean } from "@/lib/labCalc";
import { MetricSelect, MetricNotes } from "./labUi";

const SIZES = [10, 25, 50];

// The pool ranked on one number, best first (lowest first for a lower-is-better number; "Reverse" flips it), as bars from zero so negative
// numbers read correctly, with the pool's average marked. Picked players are tinted in their colour, and any who fall outside the list
// are shown under it with their rank. Click a name to add or remove him.
export default function LabBoard({ pool, available, simsAccess, colorOf, onToggle, pos, metric, onMetric }) {
  const id = useId();
  const [size, setSize] = useState(25);
  const [reverse, setReverse] = useState(false);
  const m = LAB_METRIC[metric];

  const ranked = useMemo(() => {
    const withValue = pool.filter((r) => typeof r.m[metric] === "number");
    const best = m?.lower ? (a, b) => a.m[metric] - b.m[metric] : (a, b) => b.m[metric] - a.m[metric];
    const sorted = withValue.slice().sort(best);
    return (reverse ? sorted.reverse() : sorted).map((r, i) => ({ r, rank: i + 1, v: r.m[metric] }));
  }, [pool, metric, m, reverse]);

  const shown = ranked.slice(0, size);
  const extra = ranked.slice(size).filter((x) => colorOf.has(x.r.name));
  const values = ranked.map((x) => x.v);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const avg = mean(values);
  const pct = (v) => ((v - lo) / span) * 100;
  const leader = ranked[0];

  const row = ({ r, rank, v }) => {
    const c = colorOf.get(r.name);
    return (
      <li key={r.name} className={`lab-board-row${c ? " is-picked" : ""}${rank <= 3 ? " is-top" : ""}`} style={c ? { "--c": c } : undefined}>
        <span className="lab-board-rank">{rank}</span>
        <button type="button" className="lab-board-name" onClick={() => onToggle(r.name)}>
          {r.name}
        </button>
        <span className="lab-board-badges">
          {pos === "ALL" && <PositionBadge position={r.pos} />}
          <TeamBadge team={r.team} />
        </span>
        <span className="lab-board-track">
          <span className="lab-board-bar" style={{ left: `${pct(Math.min(v, 0))}%`, width: `${(Math.abs(v) / span) * 100}%` }} />
          {lo < 0 && <span className="lab-board-zero" style={{ left: `${pct(0)}%` }} />}
        </span>
        <span className="lab-board-val">{formatMetric(metric, v)}</span>
      </li>
    );
  };

  return (
    <div className="lab-view">
      <div className="lab-controls">
        <MetricSelect id={`${id}-m`} label="Rank by" value={metric} onChange={onMetric} available={available} simsAccess={simsAccess} />
        <div className="lab-field">
          <span className="lab-field-label">Show</span>
          <div className="rk-positions" role="group" aria-label="How many players">
            {SIZES.map((n) => (
              <button key={n} type="button" className={size === n ? "active" : ""} aria-pressed={size === n} onClick={() => setSize(n)}>
                Top {n}
              </button>
            ))}
          </div>
        </div>
        <label className="lab-check">
          <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
          Reverse
        </label>
      </div>

      <div className="lab-strip">
        <div>
          <b>{leader ? formatMetric(metric, leader.v) : "—"}</b>
          <span>{leader ? `${reverse ? "Bottom" : "Top"}: ${leader.r.name}` : "Top"}</span>
        </div>
        <div>
          <b>{formatMetric(metric, avg)}</b>
          <span>Average</span>
        </div>
        <div>
          <b>{ranked.length}</b>
          <span>Players with a value</span>
        </div>
      </div>

      {ranked.length === 0 ? (
        <p className="lab-empty">Nobody in this pool has a value for {m?.label}.</p>
      ) : (
        <div className="lab-board" style={{ "--avg": `${pct(avg ?? 0)}%` }}>
          <ol className="lab-board-list">{shown.map(row)}</ol>
          {extra.length > 0 && (
            <>
              <div className="lab-board-split">Your picks further down</div>
              <ol className="lab-board-list">{extra.map(row)}</ol>
            </>
          )}
          <p className="lab-caption">
            The thin line in each bar is the average. {m?.lower ? "Lower is better for this number, so the lowest leads." : m?.neutral ? "Neither end of this number is better." : ""}
          </p>
        </div>
      )}
      <MetricNotes keys={[metric]} />
    </div>
  );
}
