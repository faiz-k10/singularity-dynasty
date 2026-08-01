# Singularity Dynasty

A subscription website for a dynasty fantasy football data-science business. Currently a single static `index.html` landing/pricing page, built in Claude.ai chat. This file is context for continuing the build in Claude Code.

## Brand
- **Name:** Singularity Dynasty
- **Theme:** space / black-hole aesthetic, with a secondary neon blue accent alongside the primary orange "event horizon" glow. A few minimalist football touches are woven in (the draft board grid mockup) but the site is not fully space-themed or fully football-themed — it's a deliberate blend.
- **Tagline / core concept:** "Where the data reaches its endpoint." The brand metaphor is gravity: scattered stats, trends, and matchups all collapse toward one clear number. The top pricing tier is literally named "Singularity" — the endpoint the whole brand points toward.
- **Voice:** confident, data-first, anti-"gut feel". Founder is a data analyst who got tired of vibes-based rankings.

## Design system (already in index.html's CSS variables)
- Colors: `--void` (#07070C, near-black bg), `--void-panel`/`--void-panel-2` (card backgrounds), `--horizon`/`--horizon-gold` (orange/gold accretion-disk accent, primary), `--neon-blue`/`--neon-blue-dim` (secondary accent), `--star`/`--star-dim` (text)
- Fonts: Space Grotesk (headings), Inter (body), IBM Plex Mono (data/stats/mono)
- Signature motifs: starfield background texture, dual radial glows (orange + blue) in the hero and closing CTA, a waxing-gibbous-moon icon used as feature-list bullets, "mock panels" that preview each product feature (ranking boards, bar charts, draft grid)
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

## Current state
- `index.html` — complete, self-contained (CSS + JS inline), no build step, no backend
- Pricing buttons currently show a placeholder alert (`data-plan` attributes on `.round-btn` elements) — not wired to real payments yet
- No login/auth, no real API data — all rankings/charts/board data in the mockups is placeholder content

## Next steps (why this is moving to Claude Code)
1. Wire the three pricing buttons to real Stripe Payment Links (create Products/Prices for Explorer and Singularity in Stripe, generate Payment Links, swap in the `href`s)
2. Add a backend (or serverless function) to handle Stripe's `checkout.session.completed` webhook and provision account tier
3. Add real auth (e.g. Clerk, Supabase Auth, Auth0) so the site knows who's logged in and what tier they're on
4. Replace placeholder mock-panel data with real data from sports APIs, likely moving the front end to React so the dashboards can be interactive
5. Build out the actual features listed above as real product pages, not just marketing previews

## Do not change without being asked
- The six features listed above and their advertised order
- The three tier names (Stargazer / Explorer / Singularity) and their "earned title" framing
- The no-trade-tools constraint
