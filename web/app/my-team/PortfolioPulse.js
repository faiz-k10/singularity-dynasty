"use client";

import { useState } from "react";

// Segment colors by bucket key -- all existing theme tokens, so they flip
// correctly in light mode. (Risk buckets keep their original CSS classes.)
const COLOR = {
  rising: "var(--neon-blue)", prime: "var(--up)", veteran: "var(--horizon-gold)", aging: "var(--down)",
  qb: "var(--pos-qb)", rb: "var(--pos-rb)", wr: "var(--pos-wr)", te: "var(--pos-te)",
  starters: "var(--up)", bench: "var(--star-dim)",
  elite: "var(--horizon-gold)", strong: "var(--up)", mid: "var(--neon-blue)", depth: "var(--star-dim)",
};

const RISK_LABEL = "Risk";

// Tabbed Portfolio Pulse: one slot-weighted stacked bar per lens. Tabs come
// from the portfolio_summary insight (lib/insights/portfolioSummary.js) plus
// the original ceiling-to-floor Risk profile as a last tab.
export default function PortfolioPulse({ summary }) {
  const tabs = [
    ...(summary.tabs || []).filter((t) => t.buckets),
    ...(summary.profile
      ? [{ key: "risk", label: RISK_LABEL, title: "Risk profile", buckets: summary.profile, risk: true }]
      : []),
  ];
  const [active, setActive] = useState(tabs[0]?.key);
  const tab = tabs.find((t) => t.key === active) || tabs[0];
  if (!tab) return null;

  return (
    <div className="po-pulse">
      <div className="po-pulse-head">
        <div className="portfolio-pulse-label">Portfolio Pulse</div>
        <span className="portfolio-pulse-sub">
          {tab.title}
          {tab.total ? ` · ${tab.rated} of ${tab.total} slots` : ` · ${summary.totalSlots} roster slots`}
        </span>
        <div className="board-toggle po-pulse-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tab.key}
              className={t.key === tab.key ? "active" : ""}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="portfolio-pulse-bar">
        {tab.buckets.map((b) => (
          <div
            key={b.key}
            className={`portfolio-pulse-seg${tab.risk ? ` portfolio-pulse-seg-${b.key}` : ""}`}
            style={{ width: `${b.pct}%`, ...(tab.risk ? null : { background: COLOR[b.key] }) }}
            title={`${b.label}: ${b.pct}%`}
          />
        ))}
      </div>
      <div className="portfolio-pulse-legend">
        {tab.buckets.map((b) => (
          <span key={b.key} className={`portfolio-pulse-legend-item${tab.risk ? ` portfolio-pulse-seg-${b.key}` : ""}`}>
            <span className="portfolio-pulse-swatch" style={tab.risk ? undefined : { background: COLOR[b.key] }} />
            {b.label} <strong>{b.pct}%</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
