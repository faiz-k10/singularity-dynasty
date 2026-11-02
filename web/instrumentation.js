// Every server-side error Next catches (a page that throws, a route handler, a server action) is recorded in app_errors so it
// shows in /admin and can trip the hourly health alert (lib/health.js). Node runtime only; the proxy's edge errors stay in
// Vercel's logs.
export async function onRequestError(err, request, context) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("./lib/errorLog.js");
  await logError({
    source: "server",
    route: `${context?.routeType || "?"} ${context?.routePath || ""}`.trim(),
    path: request?.path,
    message: err instanceof Error ? err.message : String(err),
    digest: typeof err === "object" && err && "digest" in err ? String(err.digest) : null,
  });
}
