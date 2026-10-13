"use client";

import { useState } from "react";

// Segment colors by bucket key -- all existing theme tokens, so they flip
// correctly in light mode.
const COLOR = {
  rising: "var(--neon-blue)", prime: "var(--up)", veteran: "var(--horizon-gold)", aging: "var(--down)",
  qb: "var(--pos-qb)", rb: "var(--pos-rb)", wr: "var(--pos-wr)", te: "var(--pos-te)",
  elite: "var(--horizon-gold)", strong: "var(--up)", mid: "var(--neon-blue)", depth: "var(--star-dim)",
  // Badge keys use the SAME colors as the badge dots/medallions elsewhere on the
  // site (globals.css .player-achv-dot.*), so a color means one badge everywhere.
  onFire: "var(--fire)", onIce: "var(--frost)", volatile: "var(--icarus)", locked: "var(--eddy)",
  buyLow: "var(--sprout)", sellHigh: "var(--peak)", hero: "var(--horizon)", honorable: "var(--scholar)", conArtist: "var(--menace)",
};

// Tabbed Portfolio Pulse: one stacked bar per lens, each distinct player counted once. Tabs come
// from the portfolio_summary insight (lib/insights/portfolioSummary.js).
export default function PortfolioPulse({ summary }) {
  const tabs = (summary.tabs || []).filter((t) => t.buckets);
  const [active, setActive] = useState(tabs[0]?.key);
  const tab = tabs.find((t) => t.key === active) || tabs[0];
  if (!tab) return null;

  return (
    <div className="po-pulse">
      <div className="po-pulse-head">
        <div className="portfolio-pulse-label">Portfolio Pulse</div>
        <span className="portfolio-pulse-sub">
          {tab.title}
          {tab.unit === "badges"
            ? ` · ${tab.rated} earned across your players`
            : tab.total
              ? ` · ${tab.rated} of ${tab.total} players`
              : ` · ${summary.totalPlayers} players`}
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
      {tab.buckets.length === 0 ? (
        <p className="portfolio-pulse-sub">No badges on your roster right now.</p>
      ) : (
      <>
      <div className="portfolio-pulse-bar">
        {tab.buckets.map((b) => (
          <div
            key={b.key}
            className="portfolio-pulse-seg"
            style={{ width: `${b.pct}%`, background: COLOR[b.key] }}
            title={`${b.label}: ${b.pct}%`}
          />
        ))}
      </div>
      <div className="portfolio-pulse-legend">
        {tab.buckets.map((b) => (
          <span key={b.key} className="portfolio-pulse-legend-item">
            <span className="portfolio-pulse-swatch" style={{ background: COLOR[b.key] }} />
            {b.label} <strong>{tab.unit === "badges" ? b.slots : `${b.pct}%`}</strong>
          </span>
        ))}
      </div>
      </>
      )}
    </div>
  );
}
