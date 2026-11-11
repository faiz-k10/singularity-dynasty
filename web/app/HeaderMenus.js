"use client";

import Link from "next/link";
import { useState } from "react";
import NewsletterForm from "./NewsletterForm";
import { startCheckout } from "@/lib/startCheckout";

// The Plans and Newsletter dropdowns, shared by the landing page's bar (EventHorizon.js) and the site header on every other page
// (SiteHeader.js), so both bars behave the same (founder, Nov 10 2026). Styled by the `.ehp-pm*` rules in globals.css.
export const PLANS = [
  { id: "stargazer", name: "Stargazer", r: 230, say: "The top of every board and one saved league.", month: 0, year: 0 },
  { id: "explorer", name: "Explorer", r: 150, say: "Every player, ten leagues watched live, the Tuesday email.", month: 9, year: 7 },
  { id: "singularity", name: "Singularity", r: 76, say: "Every simulation, unlimited leagues.", month: 25, year: 20 },
];

// the header's Newsletter link opens a dropdown with the sign-up right there (founder, Nov 10 2026); the link still jumps to the section
export function HeaderLetter() {
  return (
    <div className="ehp-pm ehp-nl">
      <Link href="/#feed" aria-haspopup="true">Newsletter</Link>
      <div className="ehp-pm-panel" role="group" aria-label="Newsletter sign-up">
        <NewsletterForm source="nav" inputId="navEmail" />
      </div>
    </div>
  );
}

export function HeaderPlans() {
  const [yearly, setYearly] = useState(true);
  const [busy, setBusy] = useState(null);
  async function choose(id) {
    setBusy(id);
    try {
      await startCheckout(id, yearly ? "annual" : "monthly");
    } catch {
      alert("Something went wrong starting checkout. Please try again.");
      setBusy(null);
    }
  }
  return (
    <div className="ehp-pm">
      <Link href="/#pricing" aria-haspopup="true">Plans</Link>
      <div className="ehp-pm-panel" role="group" aria-label="Plans">
        <div className="ehp-pm-bill" role="group" aria-label="Billing">
          <button type="button" className={yearly ? "" : "on"} onClick={() => setYearly(false)} aria-pressed={!yearly}>Monthly</button>
          <button type="button" className={yearly ? "on" : ""} onClick={() => setYearly(true)} aria-pressed={yearly}>Yearly</button>
        </div>
        {PLANS.map((p) => (
          <div key={p.id} className={`ehp-pm-row${p.id === "explorer" ? " is-pick" : ""}`}>
            <b>{p.name}</b>
            <em>{p.month ? `$${yearly ? p.year : p.month} / mo` : "Free"}</em>
            <button type="button" onClick={() => choose(p.id)} disabled={busy === p.id}>{busy === p.id ? "…" : p.month ? "Choose →" : "Start →"}</button>
          </div>
        ))}
        <p>{yearly ? "Billed yearly · " : ""}14-day refund, cancel any time.</p>
      </div>
    </div>
  );
}

