"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// What a signed-out visitor sees in place of any tool (founder, Nov 19 2026: "make all the tools inaccessible and instead show the
// sign up prompt unless a user has at least signed up for the free account"). proxy.js shows it (app/join) in place of
// the tool page, so none of the tool's data is sent. The link brings them back to this tool after signing up / in.
export default function SignUpGate() {
  const next = usePathname() || "/"; // the tool's own address (the proxy rewrites, it doesn't redirect);
  const href = `/login?next=${encodeURIComponent(next)}`;
  return (
    <main id="main-content" className="wrap auth-wrap">
      <div className="auth-card reveal in" data-wall="sign-up">
        <div className="eyebrow">Free account</div>
        <h1>Become a Stargazer.</h1>
        <p className="auth-sub">
          Every player, every league, every Sunday is a sky full of signals. Make a free account and start reading the stars.
        </p>
        <div className="auth-actions">
          <Link href={href} className="btn-primary">Create Free Account</Link>
          <Link href={href} className="btn-ghost">Sign In</Link>
        </div>
      </div>
    </main>
  );
}
