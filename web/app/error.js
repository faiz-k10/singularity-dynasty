"use client";

import Link from "next/link";
import { useEffect } from "react";

// Shown when a page throws while rendering (a data source down, a bug). In production the error carries only a digest --
// never the message -- which matches the server log line, so the founder can find it in Vercel's runtime logs.
// A network blip, or a tab left open across a deploy (its files and server actions are gone from the new version -- Safari says
// "Load failed"), isn't a bug in the page: reload once, quietly, instead of showing this screen (Nov 23 2026: the error log's
// recurring "Load failed" on /my-team and /account/sky). A second failure within a minute shows the screen as usual.
const STALE = /Load failed|Failed to fetch|NetworkError|ChunkLoadError|Loading chunk|dynamically imported module|Server Action|unexpected response/i;
function reloadOnce(error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (!STALE.test(msg)) return false;
  try {
    const last = Number(sessionStorage.getItem("sd-error-reload") || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem("sd-error-reload", String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export default function Error({ error, retry }) {
  useEffect(() => {
    if (reloadOnce(error)) return;
    console.error(error);
    // Recorded for /admin (app/api/client-error): where it happened and the message, nothing the visitor typed.
    try {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: window.location.pathname,
          message: error instanceof Error ? error.message : String(error),
          digest: error instanceof Error ? error.digest : null,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
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
