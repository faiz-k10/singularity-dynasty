"use client";

import Link from "next/link";
import { useEffect } from "react";

// Shown when a page throws while rendering (a data source down, a bug). In production the error carries only a digest --
// never the message -- which matches the server log line, so the founder can find it in Vercel's runtime logs.
export default function Error({ error, retry }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error ? error.digest : null;
  return (
    <div className="auth-page">
      <div className="wrap auth-wrap">
        <div className="auth-card reveal in" role="alert">
          <div className="eyebrow blue">Error</div>
          <h1>Something went wrong on our side.</h1>
          <p className="auth-sub">This page couldn&apos;t load just now. Trying again usually fixes it; if not, check back in a few minutes.</p>
          <div className="auth-actions">
            <button type="button" className="btn-primary" onClick={() => retry()}>
              Try Again
            </button>
            <Link href="/" className="btn-ghost">
              Home
            </Link>
          </div>
          {digest && <p className="auth-foot mono">Reference: {digest}</p>}
        </div>
      </div>
    </div>
  );
}
