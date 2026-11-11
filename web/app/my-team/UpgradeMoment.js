"use client";

import { useState } from "react";
import { summarizeLeagues } from "@/lib/heroLookup";
import { startCheckout } from "@/lib/startCheckout";

// Starts a Stripe Checkout session for Explorer and sends the browser there: the site's one checkout helper (lib/startCheckout.js).
export function startExplorerCheckout(billing = "annual") {
  return startCheckout("explorer", billing);
}

// Shown to a free signed-in user who has used their one saved league and looks up the rest: their own numbers with the
// detail locked ("You're in 6 leagues. 4 of 6 hold Geno Smith."), then the way in. People act on a gap in their own data
// far more than on a feature list.
export function UpgradeMoment({ teams, savedCount, limit }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const s = summarizeLeagues(teams, { exposureLimit: 100 });
  if (!s.leagues) return null;
  const top = s.exposure[0];
  const locked = s.exposure.slice(1, 4);
  const more = Math.max(0, s.exposure.length - 1);

  async function go(billing) {
    setBusy(billing);
    setErr(null);
    try {
      await startExplorerCheckout(billing);
    } catch {
      setErr("Couldn't start checkout. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="upgrade-moment" id="upgrade-moment" data-wall="upgrade-moment">
      <h3>
        You&apos;re in {s.leagues} leagues. Your free plan saves {limit}.
      </h3>
      {top && (
        <p className="um-hook">
          <b>
            {top.leagues} of {s.leagues}
          </b>{" "}
          hold <b>{top.name}</b>
          {top.proj != null && <span> &middot; {top.proj.toFixed(1)} projected this week</span>}.
        </p>
      )}
      {locked.length > 0 && (
        <ul className="um-locked" aria-label="More of your exposure, locked">
          {locked.map((e) => (
            <li key={e.name}>
              <span className="um-blur">{e.name}</span>
              <span className="um-blur">
                in {e.leagues} of {s.leagues}
              </span>
              <span className="um-tag">Locked</span>
            </li>
          ))}
          <li className="um-row-more">
            <span>{more > 3 ? `+ ${more - 3} more ${more - 3 === 1 ? "player" : "players"} you own in 2+ leagues` : "Your full exposure map"}</span>
            <span className="um-tag">Locked</span>
          </li>
          <li className="um-row-more">
            <span>Total buy-ins at risk across all {s.leagues} leagues</span>
            <span className="um-tag">Locked</span>
          </li>
        </ul>
      )}
      <button type="button" className="btn-primary um-cta" disabled={Boolean(busy)} onClick={() => go("annual")}>
        {busy === "annual" ? "Redirecting…" : `Unlock all ${s.leagues} leagues — Explorer $7/mo`}
      </button>
      <p className="um-fine">
        Billed yearly ($84). Prefer monthly?{" "}
        <button type="button" className="um-link" disabled={Boolean(busy)} onClick={() => go("monthly")}>
          $9/mo
        </button>
        . 14-day refund, cancel anytime. You have {savedCount} of {limit} saved.
      </p>
      {err && <p className="um-err">{err}</p>}
    </div>
  );
}

// Right after a first save: ask what the league cost to enter. Entering it is a small commitment, makes "$7 a month vs
// the money at risk" the natural frame, and is what the total-at-risk number is built from.
export function BuyInPrompt({ leagueName, tier, saving, onSave, onSkip }) {
  const [value, setValue] = useState("");
  const [done, setDone] = useState(null);
  const free = tier === "stargazer";

  if (done != null) {
    return (
      <div className="buyin-prompt buyin-done">
        <p>
          Got it &mdash; <b>${done}</b> at risk in {leagueName}.{" "}
          {free ? "Explorer adds up your total at risk across up to 10 leagues." : "Your total at risk across every league is in My Guys."}
        </p>
        <button type="button" className="um-link" onClick={onSkip}>
          Dismiss
        </button>
      </div>
    );
  }
  return (
    <form
      className="buyin-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return;
        onSave(v);
        setDone(v);
      }}
    >
      <label htmlFor="buyin-first">What did you pay to enter {leagueName}?</label>
      <div className="buyin-row">
        <span className="buyin-dollar">$</span>
        <input id="buyin-first" type="number" min="0" step="1" inputMode="numeric" placeholder="e.g. 100" value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="submit" className="btn-primary" disabled={saving || !value.trim()}>
          Save
        </button>
        <button type="button" className="um-link" onClick={onSkip}>
          Skip
        </button>
      </div>
      <p className="buyin-hint">Entry fee for this league (use 0 for a free league). It only ever shows to you.</p>
    </form>
  );
}
