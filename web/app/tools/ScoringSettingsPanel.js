"use client";

import { useState } from "react";
import { DEFAULT_SCORING_SETTINGS } from "@/lib/scoring";

const TE_PREMIUM_STEPS = [0, 0.5, 1];
const PPR_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "half", label: "Half PPR" },
  { value: "full", label: "Full PPR" },
];
const PPR_LABEL = { standard: "Standard", half: "Half PPR", full: "Full PPR" };

function tePremiumLabel(v) {
  return v === 0 ? "+0 PPR" : `+${v.toFixed(1)} PPR`;
}

// Controlled panel -- the parent (RedraftRankingsClient) owns `settings`
// state and persistence; this just renders the four controls and calls
// onChange with a partial update. Each field is its own collapsible
// filter-row (chevron + always-visible current value + toggle content
// underneath), same accordion pattern as Player Season Simulations'
// Position/League Size/QB Format rows -- was a single always-open grid
// of four controls before, which didn't match that page's collapsed-by-
// default look anywhere else on the site. `children` (the Position
// filter row, owned by RedraftRankingsClient) renders as one more row
// inside this SAME .filter-accordion box, rather than as its own
// separate accordion underneath -- one unified "your league" panel.
export default function ScoringSettingsPanel({ settings, onChange, isDefault, onReset, children }) {
  const [openFields, setOpenFields] = useState({
    ppr: false,
    tePremium: false,
    passingTd: false,
    int: false,
  });

  function toggleField(key) {
    setOpenFields((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  function set(key, value) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <>
      <div className="scoring-panel-head">
        <span className="scoring-panel-title">Your league&apos;s scoring</span>
        {!isDefault && (
          <button type="button" className="scoring-reset-btn" onClick={onReset}>
            Reset to default
          </button>
        )}
      </div>

      <div className="filter-accordion scoring-accordion-h">
        <div className="filter-row">
          <button
            type="button"
            className="filter-row-header"
            onClick={() => toggleField("ppr")}
            aria-expanded={openFields.ppr}
          >
            <span className={`filter-row-chevron${openFields.ppr ? " filter-row-chevron-open" : ""}`}>▸</span>
            <span className="tier-toggle-label">PPR</span>
            <span className={`filter-row-value${settings.ppr !== DEFAULT_SCORING_SETTINGS.ppr ? " filter-row-value-active" : ""}`}>
              {PPR_LABEL[settings.ppr]}
            </span>
          </button>
          {openFields.ppr && (
            <div className="tier-toggle" role="group" aria-label="PPR scoring">
              {PPR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={settings.ppr === opt.value ? "active" : ""}
                  aria-pressed={settings.ppr === opt.value}
                  onClick={() => set("ppr", opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="filter-row">
          <button
            type="button"
            className="filter-row-header"
            onClick={() => toggleField("tePremium")}
            aria-expanded={openFields.tePremium}
          >
            <span className={`filter-row-chevron${openFields.tePremium ? " filter-row-chevron-open" : ""}`}>▸</span>
            <span className="tier-toggle-label">TE Premium</span>
            <span className={`filter-row-value${settings.tePremium !== DEFAULT_SCORING_SETTINGS.tePremium ? " filter-row-value-active" : ""}`}>
              {tePremiumLabel(settings.tePremium)}
            </span>
          </button>
          {openFields.tePremium && (
            <div className="scoring-slider-body">
              <input
                type="range"
                className="scoring-slider"
                min={0}
                max={2}
                step={1}
                value={TE_PREMIUM_STEPS.indexOf(settings.tePremium)}
                onChange={(e) => set("tePremium", TE_PREMIUM_STEPS[Number(e.target.value)])}
                aria-label="Tight end premium"
              />
              <div className="scoring-slider-ticks">
                <span>0</span>
                <span>+0.5</span>
                <span>+1.0</span>
              </div>
            </div>
          )}
        </div>

        <div className="filter-row">
          <button
            type="button"
            className="filter-row-header"
            onClick={() => toggleField("passingTd")}
            aria-expanded={openFields.passingTd}
          >
            <span className={`filter-row-chevron${openFields.passingTd ? " filter-row-chevron-open" : ""}`}>▸</span>
            <span className="tier-toggle-label">Passing TD</span>
            <span className={`filter-row-value${settings.passingTdPoints !== DEFAULT_SCORING_SETTINGS.passingTdPoints ? " filter-row-value-active" : ""}`}>
              {settings.passingTdPoints} pts
            </span>
          </button>
          {openFields.passingTd && (
            <div className="tier-toggle" role="group" aria-label="Passing touchdown points">
              {[4, 6].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={settings.passingTdPoints === v ? "active" : ""}
                  aria-pressed={settings.passingTdPoints === v}
                  onClick={() => set("passingTdPoints", v)}
                >
                  {v} pts
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="filter-row">
          <button
            type="button"
            className="filter-row-header"
            onClick={() => toggleField("int")}
            aria-expanded={openFields.int}
          >
            <span className={`filter-row-chevron${openFields.int ? " filter-row-chevron-open" : ""}`}>▸</span>
            <span className="tier-toggle-label">Interception</span>
            <span className={`filter-row-value${settings.intPoints !== DEFAULT_SCORING_SETTINGS.intPoints ? " filter-row-value-active" : ""}`}>
              {settings.intPoints} pts
            </span>
          </button>
          {openFields.int && (
            <div className="tier-toggle" role="group" aria-label="Interception points">
              {[-1, -2].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={settings.intPoints === v ? "active" : ""}
                  aria-pressed={settings.intPoints === v}
                  onClick={() => set("intPoints", v)}
                >
                  {v} pts
                </button>
              ))}
            </div>
          )}
        </div>

        {children}
      </div>

      {!isDefault && (
        <p className="scoring-panel-note">
          Projections below are recalculated for these settings from each
          player&apos;s average weekly production.
        </p>
      )}
    </>
  );
}
