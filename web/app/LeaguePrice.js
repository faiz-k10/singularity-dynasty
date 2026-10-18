"use client";

import { useState, useSyncExternalStore } from "react";

// "Playing in 6 leagues? Explorer is $1.17 per league a month." The number of leagues starts from the landing hero's
// Sleeper lookup (remembered in localStorage) or 6, and can be changed with the stepper. Annual and monthly are both
// shown so it doesn't depend on the billing toggle.
const PLANS = [
  { name: "Explorer", annualMonthly: 7, monthly: 9 },
  { name: "Singularity", annualMonthly: 20, monthly: 25 },
];
const money = (v) => `$${v.toFixed(2)}`;

export default function LeaguePrice() {
  const remembered = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        const n = Number(localStorage.getItem("sd-league-count"));
        return Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), 30) : 0;
      } catch {
        return 0;
      }
    },
    () => 0
  );
  const [picked, setPicked] = useState(null);
  const n = picked ?? (remembered || 6);
  const step = (d) => setPicked(Math.max(1, Math.min(30, n + d)));

  return (
    <div className="league-price reveal d2">
      <div className="league-price-q">
        Playing in
        <span className="league-price-step">
          <button type="button" onClick={() => step(-1)} aria-label="Fewer leagues">
            −
          </button>
          <b aria-live="polite">{n}</b>
          <button type="button" onClick={() => step(1)} aria-label="More leagues">
            +
          </button>
        </span>
        {n === 1 ? "league?" : "leagues?"}
      </div>
      <ul>
        {PLANS.map((p) => (
          <li key={p.name}>
            <b>{p.name}</b> is <strong>{money(p.annualMonthly / n)}</strong> per league a month billed yearly
            <span> ({money(p.monthly / n)} on monthly)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
