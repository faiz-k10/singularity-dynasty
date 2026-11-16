"use client";

import { useState } from "react";
import BotGuard from "./BotGuard";
import { GM_ARCHETYPE_QUESTIONS as QS } from "@/lib/insights/gmArchetype";

// The Dynasty Manager quiz = the newsletter sign-up (founder, Nov 16 2026): four questions one at a time, then first name, last
// name and email; the answer is which kind of dynasty manager you are, and you're on the Tuesday letter. Saved by
// app/api/subscribe (the server scores the answers itself). Anti-bot: BotGuard (honeypot, fill time, Turnstile).
export default function ManagerQuiz({ source = "quiz", compact = false }) {
  const [step, setStep] = useState(0); // 0..QS.length-1 = questions, QS.length = details
  const [answers, setAnswers] = useState({});
  const [token, setToken] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | error
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const n = QS.length;

  function pick(key, value) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setStep((s) => Math.min(s + 1, n));
  }

  async function submit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: f.firstName.value,
          lastName: f.lastName.value,
          email: f.email.value,
          answers,
          source,
          website: f.website.value,
          t: f.t.value,
          captcha: token,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't save that just now. Please try again.");
      setResult(data.result || { label: "You're on the list", blurb: "" });
      setState("idle");
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  }

  if (result) {
    return (
      <div className={`mq mq-done${compact ? " is-compact" : ""}`} role="status">
        <div className="mq-k">You are</div>
        <div className="mq-result">{result.label}</div>
        {result.blurb && <p className="mq-blurb">{result.blurb}</p>}
        <p className="mq-fine">You&apos;re on the Tuesday letter. The first one lands next Tuesday, written for your style.</p>
      </div>
    );
  }

  const q = QS[step];
  return (
    <div className={`mq${compact ? " is-compact" : ""}`}>
      <div className="mq-top">
        <span className="mq-k">{step < n ? `Question ${step + 1} of ${n}` : "Last step"}</span>
        <span className="mq-dots" aria-hidden="true">
          {Array.from({ length: n + 1 }, (_, i) => <i key={i} className={i < step ? "on" : i === step ? "here" : ""} />)}
        </span>
      </div>
      {q ? (
        <fieldset className="mq-q">
          <legend className="mq-prompt">{q.prompt}</legend>
          <div className="mq-opts">
            {q.options.map((o) => (
              <button key={o.label} type="button" className={answers[q.key] === o.value ? "on" : ""} aria-pressed={answers[q.key] === o.value} onClick={() => pick(q.key, o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          {step > 0 && <button type="button" className="mq-back" onClick={() => setStep(step - 1)}>← Back</button>}
        </fieldset>
      ) : (
        <form className="mq-form" onSubmit={submit}>
          <p className="mq-prompt">Where should we send your result and the Tuesday letter?</p>
          <div className="mq-names">
            <label>
              <span>First name</span>
              <input name="firstName" required maxLength={40} autoComplete="given-name" />
            </label>
            <label>
              <span>Last name</span>
              <input name="lastName" required maxLength={40} autoComplete="family-name" />
            </label>
          </div>
          <label>
            <span>Email</span>
            <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@domain.com" />
          </label>
          <BotGuard action="newsletter" onToken={setToken} />
          <div className="mq-row">
            <button type="button" className="mq-back" onClick={() => setStep(n - 1)}>← Back</button>
            <button type="submit" className="btn-primary" disabled={state === "sending"}>{state === "sending" ? "Saving…" : "See my result"}</button>
          </div>
          {state === "error" && <p className="auth-error mono" role="alert">{error}</p>}
          <p className="mq-fine">One email a week. One-click unsubscribe in every email.</p>
        </form>
      )}
    </div>
  );
}
