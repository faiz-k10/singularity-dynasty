"use client";

import Link from "next/link";

// The sign-up prompt (app/join): 14 days of Explorer, no card. Signed-out visitors use the tools at the free level; any time they go to
// sign up they land here (founder, Nov 28 2026). `next` is where the buttons bring them back after signing up / in.
export default function SignUpGate({ next = "/my-team" }) {
  const href = (mode) => `/login?mode=${mode}&next=${encodeURIComponent(next)}`; // each button opens only its own form
  return (
    <main id="main-content" className="wrap auth-wrap">
      <div className="auth-card reveal in" data-wall="sign-up">
        <div className="eyebrow">14 days of Explorer, on us</div>
        <h1>Become an Explorer.</h1>
        <p className="auth-sub">
          Every player, every league, every Sunday is a sky full of signals. Make an account and explore it all with 14 days of Explorer free. No card needed.
        </p>
        <div className="auth-actions">
          <Link href={href("signup")} className="btn-primary">Start Free Trial</Link>
          <Link href={href("signin")} className="btn-ghost">Sign In</Link>
        </div>
      </div>
    </main>
  );
}
