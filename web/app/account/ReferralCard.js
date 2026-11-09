"use client";

import { useState } from "react";

// The member's referral link with Copy and Share (the phone's share sheet where there is one), and how it's going.
export default function ReferralCard({ link, discountPct, rewardLabel, summary }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const text = `I use Singularity Dynasty for floor / median / ceiling projections on every player in my leagues. ${discountPct}% off your first payment with my link:`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your link:", link);
    }
  }
  async function share() {
    try {
      await navigator.share({ title: "Singularity Dynasty", text, url: link });
    } catch {}
  }

  return (
    <div className="ref">
      <p className="acct-line">
        Give a friend <strong>{discountPct}% off</strong> their first payment. Once they have been subscribed for 14 days, you get <strong>{rewardLabel}</strong> as account credit, taken off your next bill automatically.
      </p>
      <div className="ref-link">
        <input className="feed-input auth-input mono" value={link} readOnly aria-label="Your referral link" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn-primary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
        {canShare && (
          <button type="button" className="btn-ghost" onClick={share}>
            Share
          </button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{copied ? "Link copied" : ""}</p>
      {summary && (
        <dl className="ref-stats">
          <div>
            <dt className="mono">Friends joined</dt>
            <dd>{summary.joined}</dd>
          </div>
          <div>
            <dt className="mono">Subscribed</dt>
            <dd>{summary.subscribed}</dd>
          </div>
          <div>
            <dt className="mono">Credit earned</dt>
            <dd>${(summary.earnedCents / 100).toFixed(2)}</dd>
          </div>
          {summary.waitingCents > 0 && (
            <div className="is-brand">
              <dt className="mono">Credit waiting</dt>
              <dd>${(summary.waitingCents / 100).toFixed(2)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
