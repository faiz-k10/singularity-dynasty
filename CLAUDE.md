# Singularity Dynasty

A subscription website for a dynasty fantasy football data-science business. Originally a single static `index.html` landing page (kept at repo root for reference); the live build is now a Next.js app in `web/`. This file is context for continuing the build in Claude Code.

## Brand
- **Name:** Singularity Dynasty
- **Theme:** space / black-hole aesthetic, with a secondary neon blue accent alongside the primary orange "event horizon" glow. A few minimalist football touches are woven in (the draft board grid mockup) but the site is not fully space-themed or fully football-themed — it's a deliberate blend.
- **Tagline / core concept:** "Where the data reaches its endpoint." The brand metaphor is gravity: scattered stats, trends, and matchups all collapse toward one clear number. The top pricing tier is literally named "Singularity" — the endpoint the whole brand points toward.
- **Voice:** confident, data-first, anti-"gut feel". Founder is a data analyst who got tired of vibes-based rankings.

## Design system
- Colors: `--void` (#07070C, near-black bg), `--void-panel`/`--void-panel-2` (card backgrounds), `--horizon`/`--horizon-gold` (orange/gold accretion-disk accent, primary), `--neon-blue`/`--neon-blue-dim` (secondary accent, deliberately present throughout — ticker, nav, node numerals, footer, not just decorative glows), `--star`/`--star-dim` (text)
- **Light mode exists** alongside the dark theme above (dark is still the default). Activated via `@media (prefers-color-scheme: light)` plus an explicit `:root[data-theme="light"]` override, toggled by the sun/moon button (`app/ThemeToggle.js`) on every page, persisted to `localStorage`. Theme-aware values that aren't plain hex (shadows, the starfield dot color, the ticker/menu-btn scrim, orbit-ring lines) are done as `--x-rgb` custom properties consumed via `rgba(var(--x-rgb), alpha)` — **never bake a theme-specific color into a static SVG data-URI**; that's what broke the feature-list bullet icons in light mode the first time (see globals.css `.feature-list li::before`, now a `radial-gradient` using `var(--void-panel)` instead).
- Fonts: Space Grotesk (headings), Inter (body), IBM Plex Mono (data/stats/mono) — loaded via `next/font/google` in `web/app/layout.js`, referenced in CSS as `var(--font-space-grotesk)` etc.
- Signature motifs: starfield background (mouse-parallaxed), dual radial glows (orange + blue), a draggable orbit ring of "signal chips" in the hero, an orbital hub-and-node selector for the six tools, a gravity-well playground (canvas particle sim) as the last section before the footer, click-burst micro-interactions on buttons
- No page-break dividers between sections (an earlier "orbit divider" motif was removed by request — don't reintroduce it unless asked)
- Brand mark ("Singularity Dynasty" + ring logo) is `position:fixed` top-left (`.brandmark-nav` in globals.css) on the landing page — a large, bold, blurred-glass pill so it never overlaps scrolled content underneath. On the login/account/legal pages it's just the plain in-flow `.brandmark` (via the `.auth-back` modifier), not fixed.

## Pricing tiers
Tiers are framed as **titles the subscriber earns**, not plan names:
- **Stargazer** — Free
- **Explorer** — $9/mo (~$7/mo annual), floating "MOST POPULAR" ribbon badge (the in-card eyebrow label itself reads "Standard Access" to avoid duplicating the popularity claim in two different words)
- **Singularity** — $24/mo (~$19/mo annual), marked "Full Access"

Pricing section includes a "14-DAY REFUND · CANCEL ANYTIME" reassurance line beneath the cards. The Pricing section comes right after Tools, before the Feed/newsletter section (order was deliberately swapped from an earlier build where Feed came first).

Naming history (don't reuse): Navigator, Pathfinder, Voyager, Orbiter, Ascendant, Drifter, Rover, Sojourner, Nomad, Wanderer were all considered and rejected before landing on Explorer.

## Product features (the only features to advertise — do not add trade tools)
Highlighted as full visualizations (in this order, each with a mock-panel preview):
1. **Player Season Simulations** — thousands of simulated outcomes per player, floor/median/ceiling ranges
2. **Best Ball Rankings** — ceiling-weighted rankings for tournament-style best ball

Shown in smaller cards (in this order):
3. **Dynasty Draft Board** — round-by-round startup/rookie draft board with auto-flagged stacks
4. **Redraft Weekly Rankings** — standard weekly redraft rankings, matchup-adjusted
5. **Team Analysis** — roster age curve, positional depth, contention window
6. **WR/QB Prospect Rankings & Comparisons** — rookie boards with side-by-side prospect comparisons

**Explicitly excluded:** trade calculators, trade value tools/tickers, or any "trade" framing anywhere in copy. This was deliberately removed — don't reintroduce it.

## Current state (as of this build)

**Stack:** Next.js 16 (App Router, JavaScript) + Vercel (hosting target) + Supabase (auth + Postgres) + Stripe (payments). Chosen because it's the most-documented "indie SaaS" combination and sets up the React migration this project always intended.

**Structure:**
- `index.html` — the original static landing page, kept at repo root as a design reference. No longer the live site.
- `web/` — the actual Next.js app. This is what deploys.
  - `app/page.js` — the landing page (Server Component; checks auth state for the nav, fetches the 3 most recent rows from the `posts` table for the Feed section)
  - `app/InteractiveScript.js` — all client-side interactivity (ticker, scrollspy, draggable ring, gravity playground, pricing tilt, theme toggle click handler, etc.) as one client component mounted once
  - `app/ThemeToggle.js` — the sun/moon button, rendered on every page
  - `app/login/`, `app/account/` — auth pages. `app/account/actions.js` has `openBillingPortal()`, a Server Action that creates a Stripe Customer Portal session for the signed-in user and redirects them to it
  - `app/privacy/`, `app/terms/`, `app/disclaimer/`, `app/contact/` — legal/trust pages, linked from the footer. Share a `.legal-card` prose style in globals.css. The Disclaimer page and the ToS both explicitly state the content isn't intended for gambling/wagering use and disclaim liability for related gains or losses — **don't water that language down**, it was added deliberately for liability protection. Contact page currently shows the founder's personal Gmail as a placeholder support address.
  - `app/api/checkout/route.js` — creates Stripe Checkout Sessions
  - `app/api/webhooks/stripe/route.js` — verifies Stripe signatures, provisions tier in Supabase
  - `lib/supabase/` — browser/server/admin Supabase client helpers
  - `proxy.js` — Next.js 16's renamed `middleware.js`; refreshes the Supabase session cookie
  - `supabase/migrations/0001_profiles.sql` — the `profiles` table schema (id, email, tier, stripe_customer_id, stripe_subscription_id) with RLS + auto-create trigger on signup
  - `supabase/migrations/0002_posts.sql` — the `posts` table (title, url, published_at) powering the Feed section's "Recent Drops" cards. Public read via RLS, no client-side write policy — new posts are added by hand through the Supabase Table Editor, not code
  - `scripts/` — dev utilities: `create-stripe-products.mjs` (idempotent, creates the 4 Prices), `create-test-user.mjs`, `test-webhook-provisioning.mjs`, `test-webhook-cancellation.mjs`, `check-profile.mjs`, `check-posts.mjs`, `setup-billing-portal.mjs` (idempotent — creates the Stripe Customer Portal configuration; **must be re-run against live keys** once Stripe goes live, since test/live are separate Stripe environments), `test-billing-portal.mjs` (all bypass the browser to test Stripe/Supabase plumbing directly — useful since browser-automation click reliability was flaky in this environment)

**Live:** https://web-kohl-ten-94.vercel.app (Vercel project `erem/web`, auto-deploys on push to `main`, Root Directory set to `web`). No custom domain connected yet — still on the `.vercel.app` URL.

**What's working (verified end-to-end, both locally and in production):**
- Stripe: real Checkout Sessions for Explorer/Singularity × monthly/annual, correct pricing, `client_reference_id` set when the shopper is signed in
- Webhook: signature verification, price→tier resolution, provisions/reverts `profiles.tier` on checkout completion, subscription update, and cancellation — registered against the live URL in Stripe (endpoint id `we_1TziBWLS7Fbu3eML3Yaa0DjW`, its own `whsec_` stored in Vercel, separate from the local one)
- Supabase auth: email/password signup and signin, session cookies via `@supabase/ssr`, protected `/account` route, nav reflects auth state
- Stripe Customer Portal: account page's "Manage Billing" button (shown instead of "Upgrade Plan" once a profile has a `stripe_customer_id`) creates a real portal session and redirects there — verified live click-through against a real Stripe test customer
- Full loop tested live on the production URL: sign in → account shows tier → simulated purchase → account updates to the purchased tier → simulated cancellation → reverts to "Stargazer"
- Vercel Analytics: package installed and `<Analytics />` mounted in `app/layout.js`. Still needs the one-click "Enable" toggle in the Vercel dashboard's Analytics tab for the `web` project before data starts flowing — that's an account-settings action left for the user to do themselves.

**Known local-dev quirks (not code bugs):**
- The Stripe CLI and Supabase CLI both needed installing via direct GitHub-release binaries to `~/bin` instead of Homebrew, because this machine's Xcode Command Line Tools are outdated (`brew install` fails; fixing it needs `sudo`/the user's password, which cannot be run from here). Same story for the Vercel CLI, except that one installs cleanly via `npm install -g vercel` since it's pure JS.
- Supabase's built-in email sender has a low rate limit on the free tier, which is why "Confirm email" was temporarily switched off during local testing. **It has since been re-enabled** — new signups now require clicking a confirmation link before they can sign in.
- Supabase validates signup email domains for deliverability — `example.com`/`.test` addresses are rejected; use a real domain (e.g. `mailinator.com` for disposable test inboxes) when testing signup by hand.
- Setting a Vercel project's Root Directory via `vercel project update` isn't exposed in the CLI; had to PATCH `https://api.vercel.com/v9/projects/{id}` directly using the token from `~/Library/Application Support/com.vercel.cli/auth.json`.
- The Browser pane used for visual QA in this environment intermittently suspends rendering on a tab (`document.hidden` goes `true`, screenshots return stale/blank frames, `scrollTo` stops sticking). Workarounds that have worked: `tabs_select` to re-front the tab, `resize_window` to force a repaint, or falling back to reading computed styles via `javascript_tool` instead of a screenshot when a picture isn't strictly necessary.

**Credentials:** all live in `web/.env.local` (gitignored) and mirrored in Vercel's project env vars (Production/Preview/Development). `.env.local.example` documents every key needed. Stripe is in **test mode** — no real charges are possible yet. Supabase project: `nkzazbqjupexwnehkktl`. GitHub repo: `faiz-k10/singularity-dynasty` (private). Vercel project: `erem/web`.

## Next steps
1. Replace placeholder mock-panel data with real data from sports APIs, likely moving more of the front end to interactive dashboards behind auth. This is the big one — right now all six features are marketing previews with mock data, nothing real lives behind a paid tier yet.
2. Build out the six features listed above as real product pages, gated by `profiles.tier`, not just marketing previews.
3. Publish actual posts to the `posts` table (Supabase Table Editor) — the Feed section is wired up but empty, showing a "coming soon" placeholder.
4. Mobile responsiveness pass — everything so far has only been verified at desktop widths.
5. Before accepting real payments: switch Stripe from test to live mode (new live Products/Prices via `create-stripe-products.mjs`, new live webhook endpoint, re-run `setup-billing-portal.mjs` against live keys), and have an actual attorney review the Privacy/Terms/Disclaimer boilerplate.
6. Nice-to-haves flagged but not started: a custom domain (would also allow replacing the personal-Gmail contact address), Open Graph/Twitter card meta tags for social link previews, and a sitemap.xml/robots.txt once there's real content to index.

## Do not change without being asked
- The six features listed above and their advertised order
- The three tier names (Stargazer / Explorer / Singularity) and their "earned title" framing
- The no-trade-tools constraint
- The dark void + orange/gold + neon blue color system and the three fonts
