"use client";

const TE_PREMIUM_STEPS = [0, 0.5, 1];

// Controlled panel -- the parent (RedraftRankingsClient) owns `settings`
// state and persistence; this just renders the four controls and calls
// onChange with a partial update.
export default function ScoringSettingsPanel({ settings, onChange, isDefault, onReset }) {
  function set(key, value) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="scoring-panel">
      <div className="scoring-panel-head">
        <span className="scoring-panel-title">Your league&apos;s scoring</span>
        {!isDefault && (
          <button type="button" className="scoring-reset-btn" onClick={onReset}>
            Reset to default
          </button>
        )}
      </div>

      <div className="scoring-panel-grid">
        <div className="scoring-field">
          <span className="scoring-field-label">PPR</span>
          <div className="scoring-pill-group" role="group" aria-label="PPR scoring">
            {[
              { value: "standard", label: "Standard" },
              { value: "half", label: "Half PPR" },
              { value: "full", label: "Full PPR" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`scoring-pill ${settings.ppr === opt.value ? "active" : ""}`}
                aria-pressed={settings.ppr === opt.value}
                onClick={() => set("ppr", opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="scoring-field">
          <span className="scoring-field-label">
            TE premium <span className="scoring-field-value mono">
              {settings.tePremium === 0 ? "+0" : `+${settings.tePremium.toFixed(1)}`} PPR
            </span>
          </span>
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

        <div className="scoring-field">
          <span className="scoring-field-label">Passing TD</span>
          <div className="scoring-pill-group" role="group" aria-label="Passing touchdown points">
            {[4, 6].map((v) => (
              <button
                key={v}
                type="button"
                className={`scoring-pill ${settings.passingTdPoints === v ? "active" : ""}`}
                aria-pressed={settings.passingTdPoints === v}
                onClick={() => set("passingTdPoints", v)}
              >
                {v} pts
              </button>
            ))}
          </div>
        </div>

        <div className="scoring-field">
          <span className="scoring-field-label">Interception</span>
          <div className="scoring-pill-group" role="group" aria-label="Interception points">
            {[-1, -2].map((v) => (
              <button
                key={v}
                type="button"
                className={`scoring-pill ${settings.intPoints === v ? "active" : ""}`}
                aria-pressed={settings.intPoints === v}
                onClick={() => set("intPoints", v)}
              >
                {v} pts
              </button>
            ))}
          </div>
        </div>
      </div>

      {!isDefault && (
        <p className="scoring-panel-note">
          Projections below are recalculated for these settings from each
          player&apos;s average weekly production.
        </p>
      )}
    </div>
  );
}
