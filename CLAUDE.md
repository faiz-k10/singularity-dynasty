# Singularity Dynasty

A subscription website for a dynasty fantasy football data-science business. Originally a single static `index.html` landing page (kept at repo root for reference); the live build is now a Next.js app in `web/`. This file is context for continuing the build in Claude Code.

## Brand
- **Name:** Singularity Dynasty
- **Theme:** space / black-hole aesthetic, with a secondary neon blue accent alongside the primary orange "event horizon" glow. A few minimalist football touches are woven in (the draft board grid mockup) but the site is not fully space-themed or fully football-themed — it's a deliberate blend.
- **Tagline / core concept:** "Where the data reaches its endpoint." The brand metaphor is gravity: scattered stats, trends, and matchups all collapse toward one clear number. The top pricing tier is literally named "Singularity" — the endpoint the whole brand points toward.
- **Voice:** confident, data-first, anti-"gut feel". Founder is a data analyst who got tired of vibes-based rankings.

## Design system
- Colors: `--void` (#07070C, near-black bg), `--void-panel`/`--void-panel-2` (card backgrounds), `--horizon`/`--horizon-gold` (orange/gold accretion-disk accent, primary), `--neon-blue`/`--neon-blue-dim` (secondary accent, deliberately present throughout — ticker, nav, node numerals, footer, not just decorative glows), `--star`/`--star-dim` (text)
- Fonts: Space Grotesk (headings), Inter (body), IBM Plex Mono (data/stats/mono) — loaded via `next/font/google` in `web/app/layout.js`, referenced in CSS as `var(--font-space-grotesk)` etc.
- Signature motifs: starfield background (mouse-parallaxed), dual radial glows (orange + blue), a draggable orbit ring of "signal chips" in the hero, an orbital hub-and-node selector for the six tools, a gravity-well playground (canvas particle sim) as the last section before the footer, click-burst micro-interactions on buttons
- No page-break dividers between sections (an earlier "orbit divider" motif was removed by request — don't reintroduce it unless asked)

## Pricing tiers
Tiers are framed as **titles the subscriber earns**, not plan names:
- **Stargazer** — Free
- **Explorer** — $9/mo (~$7/mo annual), marked "Most Popular"
- **Singularity** — $24/mo (~$19/mo annual), marked "Full Access"

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
  - `app/page.js` — the landing page (Server Component; checks auth state for the nav)
  - `app/InteractiveScript.js` — all client-side interactivity (ticker, scrollspy, draggable ring, gravity playground, pricing tilt, etc.) as one client component mounted once
  - `app/login/`, `app/account/` — auth pages
  - `app/api/checkout/route.js` — creates Stripe Checkout Sessions
  - `app/api/webhooks/stripe/route.js` — verifies Stripe signatures, provisions tier in Supabase
  - `lib/supabase/` — browser/server/admin Supabase client helpers
  - `proxy.js` — Next.js 16's renamed `middleware.js`; refreshes the Supabase session cookie
  - `supabase/migrations/0001_profiles.sql` — the `profiles` table schema (id, email, tier, stripe_customer_id, stripe_subscription_id) with RLS + auto-create trigger on signup
  - `scripts/` — dev utilities: `create-stripe-products.mjs` (idempotent, creates the 4 Prices), `create-test-user.mjs`, `test-webhook-provisioning.mjs`, `test-webhook-cancellation.mjs`, `check-profile.mjs` (all bypass the browser to test Stripe/Supabase plumbing directly — useful since browser-automation click reliability was flaky in this environment)

**What's working (verified end-to-end locally):**
- Stripe: real Checkout Sessions for Explorer/Singularity × monthly/annual, correct pricing, `client_reference_id` set when the shopper is signed in
- Webhook: signature verification, price→tier resolution, provisions/reverts `profiles.tier` on checkout completion, subscription update, and cancellation
- Supabase auth: email/password signup and signin, session cookies via `@supabase/ssr`, protected `/account` route, nav reflects auth state
- Full loop tested live: sign in → account shows "Stargazer" → simulated purchase → account shows "Explorer" → simulated cancellation → reverts to "Stargazer"

**Known local-dev quirks (not code bugs):**
- The Stripe CLI and Supabase CLI both needed installing via direct GitHub-release binaries to `~/bin` instead of Homebrew, because this machine's Xcode Command Line Tools are outdated (`brew install` fails; fixing it needs `sudo`/the user's password, which cannot be run from here).
- Supabase's built-in email sender has a low rate limit on the free tier; "Confirm email" was turned off in Supabase Auth settings for local testing (**should be turned back on before going live**).
- Supabase validates signup email domains for deliverability — `example.com`/`.test` addresses are rejected; use a real domain (e.g. `mailinator.com` for disposable test inboxes) when testing signup by hand.

**Credentials:** all live in `web/.env.local` (gitignored). `.env.local.example` documents every key needed. Stripe is in **test mode**. Supabase project: `nkzazbqjupexwnehkktl`. GitHub repo: `faiz-k10/singularity-dynasty` (private).

## Next steps
1. **Deploy to Vercel** — connect the GitHub repo, set the same env vars there, register the production Stripe webhook endpoint (a separate `whsec_` from the local one), re-enable Supabase email confirmation before going live.
2. Replace placeholder mock-panel data with real data from sports APIs, likely moving more of the front end to interactive dashboards behind auth.
3. Build out the six features listed above as real product pages, gated by `profiles.tier`, not just marketing previews.
4. Consider a billing-portal link (Stripe Customer Portal) on the account page so subscribers can self-manage/cancel.

## Do not change without being asked
- The six features listed above and their advertised order
- The three tier names (Stargazer / Explorer / Singularity) and their "earned title" framing
- The no-trade-tools constraint
- The dark void + orange/gold + neon blue color system and the three fonts
