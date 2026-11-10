"use client";

import { useState } from "react";

// The home page's newsletter sign-up, saving to the email list (app/api/subscribe -> table `subscribers`). It used to show
// "Signal locked" without saving anything.
// `inputId` keeps two copies on one page apart (the landing page has one in its header dropdown and one in its own section).
export default function NewsletterForm({ source = "home", inputId = "feedEmail" }) {
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.value, website: form.website.value, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't save that just now. Please try again.");
      setState("done");
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  }

  return (
    <form className={`feed-form reveal in${state === "done" ? " sent" : ""}`} onSubmit={submit} noValidate={false}>
      <label className="feed-label mono" htmlFor={inputId}>
        EMAIL ADDRESS
      </label>
      <div className="feed-input-row">
        <input type="email" id={inputId} name="email" className="feed-input" placeholder="you@domain.com" required maxLength={254} autoComplete="email" disabled={state === "done"} />
        <button type="submit" className="btn-primary feed-submit" disabled={state === "sending" || state === "done"}>
          {state === "sending" ? "Saving…" : "Subscribe"}
        </button>
      </div>
      {/* A field only bots fill in (hidden from people and screen readers). */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="feed-trap" defaultValue="" />
      <p className="feed-fineprint">No spam. One email a week. Every email has a one-click unsubscribe link.</p>
      <p className="feed-success mono" role="status">
        {state === "done" ? "You're on the list. The first email lands next Tuesday." : ""}
      </p>
      {state === "error" && (
        <p className="auth-error mono" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
