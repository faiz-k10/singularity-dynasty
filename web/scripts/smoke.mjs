// Route smoke test: hit every page and assert it renders without a
// server error. Catches the class of break where a query references a
// column/table that doesn't exist, a Server Component throws, or a route
// 500s -- none of which `next build` or the unit tests would surface.
//
// Needs the app running. Locally:
//   npm run build && npm start &   # then:
//   npm run smoke
// CI does this automatically (see .github/workflows/ci.yml).
//
// BASE_URL overrides the target (default http://localhost:3000).

const BASE = process.env.BASE_URL || "http://localhost:3000";

// Public routes that must return a usable page for a signed-out visitor.
const ROUTES = [
  "/",
  "/login",
  "/account", // redirects to /login when signed out -- still must not error
  "/my-team",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/contact",
  "/tools/redraft-rankings",
  "/tools/draft-board",
  "/tools/player-simulations",
  "/tools/prospect-rankings",
  "/tools/compare-players",
  "/tools/compare-player-sims",
  "/tools/lab",
  "/my-team/quiz",
  "/sitemap.xml",
  "/robots.txt",
];

// A few tool pages with sort/type params, to exercise resolveSort + sortRows
// against real data rather than just the default view.
const PARAMS = [
  "/tools/redraft-rankings?sort=projection&dir=asc",
  "/tools/draft-board?type=rookie",
  "/tools/draft-board?type=startup",
  "/tools/lab?view=compare&pos=TE",
  "/tools/prospect-rankings?qb_sort=name&qb_dir=desc",
  "/tools/player-simulations?sort=ceiling&dir=desc",
];

let failed = 0;

async function check(path) {
  const url = BASE + path;
  let res;
  try {
    res = await fetch(url, { redirect: "manual", headers: { "user-agent": "smoke-test" } });
  } catch (err) {
    console.log(`FAIL ${path}  -> fetch threw: ${err.message}`);
    failed++;
    return;
  }

  // 2xx = rendered, 3xx = an intentional redirect (e.g. /account -> /login).
  // Anything 4xx/5xx is a break.
  if (res.status >= 400) {
    console.log(`FAIL ${path}  -> HTTP ${res.status}`);
    failed++;
    return;
  }

  if (res.status < 300) {
    const body = await res.text();
    // Next renders a recognizable error shell on an unhandled throw even
    // when the status is 200 in some configs -- catch that too.
    if (/Application error: a server-side exception/i.test(body) ||
        /Internal Server Error/i.test(body)) {
      console.log(`FAIL ${path}  -> error text in a ${res.status} body`);
      failed++;
      return;
    }
  }

  console.log(`ok   ${path}  (${res.status})`);
}

console.log(`Smoke test against ${BASE}\n`);
for (const path of [...ROUTES, ...PARAMS]) {
  await check(path);
}

console.log(failed ? `\n${failed} route(s) FAILED` : `\nall ${ROUTES.length + PARAMS.length} routes ok`);
process.exit(failed ? 1 : 0);
