"use client";

// The tab switch used inside a panel (a league's Matchup / Lineup Alerts / ... tabs, the Compare Players tabs): tabs = [[key, label, alerts?], ...];
// a third item above 0 puts an inner border on that tab (used for the Lineup Alerts tab).
export default function PanelTabs({ tabs, value, onChange, label = "View" }) {
  return (
    <div className="board-toggle league-dash-tabs" role="tablist" aria-label={label}>
      {tabs.map(([key, text, alerts]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          className={`${value === key ? "active" : ""}${alerts > 0 ? " has-alerts" : ""}`.trim()}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
