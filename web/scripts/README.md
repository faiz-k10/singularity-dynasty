# scripts/

Node scripts that talk to Supabase / Stripe directly, outside the Next app. Run them from `web/` with the env file loaded:

```bash
node --env-file=.env.local scripts/<name>.mjs
```

Every script's own header comment says exactly what it does and how to call it; this page is the map.

## The weekly run (scheduled)

| Script | What it does |
|---|---|
| `weekly-run.mjs` | The one entry point the scheduled tasks call (`tuesday`, `thursday`, `sunday`, `projections`, `backup`): runs the R model, publishes every table below in order, verifies, backs up and sends the digest. Safety checks live here, not in a prompt. |

## Publishers (called by `weekly-run.mjs`; safe to run by hand after a model run)

| Script | Writes to | Notes |
|---|---|---|
| `publish-rankings.mjs` | `redraft_rankings` | Updates rows by `(player_name, season, week)` from `model/upload_redraft_rankings.csv`. |
| `publish-player-simulations.mjs` | `player_simulations` | Upserts by `(player_name, season, week)`, then removes that week's rows no longer in the CSV (capped at 60). |
| `publish-player-game-log.mjs` | `player_game_log` | Full delete + reinsert (~12k rows). |
| `publish-actual-production.mjs` | `player_actual_production` | Derived from `player_game_log`. |
| `publish-player-archetypes.mjs` | `player_archetypes` | Upsert + remove the week's stale rows. |
| `publish-player-groups.mjs` | `player_groups` | Sustainability, career stage, TD and usage profiles (one `kind` each). |
| `publish-defense-leans.mjs` | `defense_leans` | The Smash / Tough Spot trends. |
| `publish-player-directory.mjs` | `player_directory` | Names, ids, bios (replaces Sleeper's player list). |
| `send-weekly-digest.mjs` | email (Resend) | Dry run by default; `--send` only once Resend is set up. |
| `backup.mjs` | `Website/Backups/` | Every table plus the model files git doesn't keep; keeps the newest 8. |

## Reports

| Script | Purpose |
|---|---|
| `wall-report.mjs [days]` | Which paywalls get seen and clicked, and how many clickers pay now (also on `/admin`). |
| `backtest-pregame-winchance.mjs` | Replays the saved leagues' real matchups through `lib/winChance.js` to check its calibration. |
| `check-projection-math.mjs` | Sanity-checks the projection CSV numbers. |
| `smoke.mjs` | Hits every public route (`BASE_URL=...`) and fails on any server error or missing page. CI runs it. |

## One-time setup (idempotent; rerun only when noted)

| Script | Purpose |
|---|---|
| `create-stripe-products.mjs` | Creates the 4 Prices (Explorer / Singularity × monthly / annual). |
| `setup-billing-portal.mjs` | Stripe Customer Portal configuration (plan switching on). |
| `stripe-go-live.mjs` | **The founder runs it with the live key in the command:** live products, prices, portal and webhook in one go. |
| `setup-lab-shares-bucket.mjs` | The public Storage bucket for The Observatory's shared charts. |
| `backfill-targets.mjs` | Already run: WR / TE Targets for the season-sim weeks published before Targets existed. |
| `rebuild-week-history.mjs` | Already run (Oct 20 2026): earlier weeks put on the current method. |

## Dev checks (never change real data)

| Script | Purpose |
|---|---|
| `create-test-user.mjs` | Creates a confirmed test user via the Supabase Admin API. |
| `check-profile.mjs <user_id>` | Prints a user's `profiles` row. |
| `check-posts.mjs` | Prints the `posts` table (Feed section). |
| `test-webhook-billing.mjs [user_id]` | Test keys only: a real test-mode subscription through the local webhook, then cancelled. |
| `test-billing-portal.mjs` | Creates a real portal session for the test user. |
