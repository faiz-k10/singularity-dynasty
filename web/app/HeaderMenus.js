"use client";

import Link from "next/link";
import { useState } from "react";
import { startCheckout } from "@/lib/startCheckout";

// The Plans and Newsletter dropdowns, shared by the landing page's bar (EventHorizon.js) and the site header on every other page
// (SiteHeader.js), so both bars behave the same (founder, Nov 10 2026). Styled by the `.ehp-pm*` rules in globals.css.
// What each plan includes (founder, Nov 22 2026; the reasoning is in CLAUDE.md "Tier packaging"). Listed dearest first so $84 reads as the
// sensible middle beside $240; Explorer is marked Most popular. `feats` lists only features that are live, each plan "plus" the one below.
export const PLANS = [
  {
    id: "singularity", name: "Singularity", r: 76, say: "The research edge: every simulation, every league.", month: 30, year: 20, tag: "Founding price",
    plus: "Everything in Explorer, plus",
    feats: [
      "Season simulations for every player, with pace, shapes and comparisons",
      "The full Observatory, simulation numbers included",
      "Unlimited leagues, all live",
      "Bonus Prospect Data content",
      "Your founding price, locked while you stay (first 50)",
      "Priority Discord",
    ],
  },
  {
    id: "explorer", name: "Explorer", r: 150, say: "Run every league from one board.", month: 12, year: 7, tag: "Most popular",
    plus: "Everything in Stargazer, plus",
    feats: [
      "Up to 10 leagues, live on the Game Board",
      "Start / sit swaps and playoff odds in every league",
      "Every player in the weekly rankings and the full Dynasty Board",
      "Your exposure across leagues and desktop alerts",
      "Compare three players at once",
      "Prospect Deep Dives",
    ],
  },
  {
    id: "stargazer", name: "Stargazer", r: 230, say: "One league, live every Sunday. Free.", month: 0, year: 0,
    feats: [
      "1 league live on the Game Board, with lineup alerts",
      "The top 50 weekly, top 20 dynasty and top 10 season sims",
      "Every prospect ranking, The Night Sky and share cards",
      "14 days of Explorer when you join, no card",
    ],
  },
];

// The header's Newsletter link (founder, Nov 16 2026: the sign-up is now the Dynasty Manager quiz): the dropdown says what it is and
// leads to /newsletter, where the quiz is (four questions are too much for a hover menu that closes when the pointer leaves).
export function HeaderLetter() {
  return (
    <div className="ehp-pm ehp-nl">
      <Link href="/newsletter" aria-haspopup="true">Newsletter</Link>
      <div className="ehp-pm-panel" role="group" aria-label="Newsletter">
        <p className="ehp-nl-h">What kind of dynasty manager are you?</p>
        <p>Four questions, one minute. Get your answer and the Singularity Drive: Newsletter to go beyond the data!</p>
        <Link className="ehp-nl-go" href="/newsletter">Take the quiz →</Link>
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

