# Dynasty Singularity

Subscription website for a dynasty fantasy-football data-science business.

- **Live:** https://web-kohl-ten-94.vercel.app (auto-deploys from `main`)
- **Stack:** Next.js 16 (App Router, JS) · Supabase (auth + Postgres) · Stripe · Vercel
- **Read before changing anything:** [`CLAUDE.md`](CLAUDE.md) — architecture, conventions, product decisions, gotchas.

## Repo layout

| Path | What it is |
|---|---|
| [`web/`](web/README.md) | The Next.js app — this is what deploys. Setup, local dev, and webhook testing are in its own README. |
| [`model/`](model/README.md) | R projection model + backtests. Runs locally; output reaches Supabase via the publish scripts below. |
| `index.html` | The original static landing page, kept as a design reference. Not the live site. |
| `csv-upload-formats.html` | Reference sheet for the Supabase Table Editor CSV import column shapes. |
| `CLAUDE.md` | Full context — the source of truth for how the pieces fit together. |

## Common tasks

```bash
cd web
npm run dev          # local dev at http://localhost:3000
npm run build        # production build — the CI gate
npm test             # unit tests + route smoke check
```

**Deploy:** push to `main`; Vercel builds and deploys automatically. No CLI step.

**Publish model data** (from `web/`, after running the R scripts):

```bash
node --env-file=.env.local scripts/publish-rankings.mjs
node --env-file=.env.local scripts/publish-player-simulations.mjs
node --env-file=.env.local scripts/publish-player-game-log.mjs
```

**Schema changes:** hand-applied SQL in `web/supabase/migrations/` — run each in
the Supabase SQL editor (the project isn't linked for `supabase db push`).
See [`web/scripts/README.md`](web/scripts/README.md) for what every script does.
