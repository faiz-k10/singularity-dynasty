"use client";

import { useEffect, useRef, useState } from "react";
import { LAB_GROUPS, LAB_METRICS, LAB_METRIC, formatMetric } from "@/lib/labMetrics";

// Pieces shared by The Lab's views: the colours of the picked players, position colours, a width-measuring hook for the charts and the
// metric picker.

// One colour per picked player, in the order they were added (theme tokens, so both themes work). Mint, mission red, steel, the old gold and frost blue -- all from the Europa palette, each with a light-mode value.
export const PICK_COLORS = ["var(--horizon-gold)", "var(--down)", "var(--neon-blue)", "var(--established)", "var(--frost)"];
export const MAX_PICKS = PICK_COLORS.length;
export const POS_COLOR = { QB: "var(--pos-qb)", RB: "var(--pos-rb)", WR: "var(--pos-wr)", TE: "var(--pos-te)" };

// "Ja'Marr Chase" -> "J. Chase" (chart labels; the full name is in the tooltip).
export function shortName(name) {
  const parts = String(name || "").split(" ");
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
}

// An axis tick as the metric is written, without a trailing ".0" ("35.0" -> "35", "12.0%" -> "12%"): ticks are round numbers.
export function tickLabel(key, t) {
  return formatMetric(key, t).replace(/\.0+(?=%|$)/, "");
}

// Chart labels for the picked players, nudged down until none overlaps another (labels: [{ id, x, y, text, anchor }], about 6.6px a
// character at the label size). Greedy, top to bottom: with five labels at most that is all it needs.
export function placeLabels(labels) {
  const placed = [];
  const span = (l) => {
    const w = l.text.length * 6.6;
    return l.anchor === "end" ? [l.x - w, l.x] : [l.x, l.x + w];
  };
  for (const l of labels.slice().sort((a, b) => a.y - b.y)) {
    const [a0, a1] = span(l);
    let y = l.y;
    for (let guard = 0; guard < 12; guard++) {
      const hit = placed.find((p) => Math.abs(p.y - y) < 13 && a0 < p.span[1] && p.span[0] < a1);
      if (!hit) break;
      y = hit.y + 13;
    }
    placed.push({ ...l, y, span: [a0, a1] });
  }
  return placed;
}

// The rendered width of an element, kept current with a ResizeObserver. 0 until mounted, so charts draw only in the browser (no
// server / client mismatch) at exactly the width they get.
export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// A metric picker: a native select grouped by section. Only metrics with values in the current pool are offered; the season simulation
// ones are listed but disabled for viewers without Singularity, so it's clear they exist.
export function MetricSelect({ label, value, onChange, available, simsAccess, id }) {
  return (
    <label className="lab-field" htmlFor={id}>
      <span className="lab-field-label">{label}</span>
      <select id={id} className="lab-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {LAB_GROUPS.map((group) => {
          const items = LAB_METRICS.filter((m) => m.group === group && (available.has(m.key) || (m.tier === "singularity" && !simsAccess)));
          if (!items.length) return null;
          return (
            <optgroup key={group} label={group}>
              {items.map((m) => {
                const locked = m.tier === "singularity" && !simsAccess;
                return (
                  <option key={m.key} value={m.key} disabled={locked}>
                    {m.label}
                    {locked ? " · Singularity" : ""}
                  </option>
                );
              })}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}

// The brand signature in an exported picture (hidden on the page; shown under `.is-exporting`). On a chart it sits just above the right end of
// the x axis (`axis` = the chart's right and bottom margins), inside the picture's busiest part so no crop can lose it; views without an axis
// (Leaderboard, Compare) put it under the view.
export function Signature({ axis = null }) {
  return (
    <div className={`lab-export-foot${axis ? " is-on-axis" : ""}`} style={axis ? { right: axis.r, bottom: axis.b + 6 } : undefined} aria-hidden="true">
      <span className="ring" />
      Singularity Dynasty · The Lab
    </div>
  );
}

// "What these numbers are": the chosen metrics' hover text, written out under a chart for anyone researching with it.
export function MetricNotes({ keys }) {
  const seen = [...new Set(keys)].map((k) => LAB_METRIC[k]).filter(Boolean);
  if (!seen.length) return null;
  return (
    <dl className="lab-notes">
      {seen.map((m) => (
        <div key={m.key}>
          <dt>{m.label}</dt>
          <dd>{m.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
