// Every server-side error Next catches (a page that throws, a route handler, a server action) is recorded in app_errors so it
// shows in /admin and can trip the hourly health alert (lib/health.js). Node runtime only; the proxy's edge errors stay in
// Vercel's logs.
export async function onRequestError(err, request, context) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // a visitor who closes the tab (or navigates away) while a streamed page is still sending: not a fault of the site, and it
  // shouldn't count toward the hourly error alarm (Nov 23 2026: it was a third of the server errors in the log)
  const msg = err instanceof Error ? err.message : String(err);
  if (/destination stream errored|aborted|ECONNRESET|socket hang up/i.test(msg)) return;
  const { logError } = await import("./lib/errorLog.js");
  await logError({
    source: "server",
    route: `${context?.routeType || "?"} ${context?.routePath || ""}`.trim(),
    path: request?.path,
    message: err instanceof Error ? err.message : String(err),
    digest: typeof err === "object" && err && "digest" in err ? String(err.digest) : null,
  });
}
