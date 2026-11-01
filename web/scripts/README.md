# scripts/

One-off Node scripts that talk to Supabase / Stripe directly, outside the
Next app. Run them from `web/` with the env file loaded:

```bash
node --env-file=.env.local scripts/<name>.mjs
```

They exist because browser-automation click reliability was flaky in
development, so the Stripe/Supabase plumbing is exercised straight from Node.

## Publishers — run whenever the model output updates

| Script | Writes to | Notes |
|---|---|---|
| `publish-rankings.mjs` | `redraft_rankings` | Updates rows by `(player_name, season, week)`. Reads `model/upload_redraft_rankings.csv`. |
| `publish-player-simulations.mjs` | `player_simulations` | Updates rows by `(player_name, season, week)`. |
| `publish-player-game-log.mjs` | `player_game_log` | Full delete + reinsert (~12k rows). Reads `model/upload_player_game_log.csv`. |

## One-time setup — idempotent, rerun only when noted

| Script | Purpose |
|---|---|
| `create-stripe-products.mjs` | Creates the 4 Prices (Explorer/Singularity × monthly/annual). **Rerun against live keys when Stripe goes live.** |
| `setup-billing-portal.mjs` | Creates the Stripe Customer Portal configuration. **Rerun against live keys when Stripe goes live.** |

## Dev checks — verification only, never touch production data meaningfully

| Script | Purpose |
|---|---|
| `create-test-user.mjs` | Creates a confirmed test user via the Supabase Admin API; checks the profile auto-create trigger. |
| `check-profile.mjs <user_id>` | Prints a user's `profiles` row. |
| `check-posts.mjs` | Prints the `posts` table (Feed section). |
| `check-projection-math.mjs` | Sanity-checks the projection CSV numbers. |
| `test-webhook-billing.mjs [user_id]` | Test keys only: a real test-mode Explorer subscription (Stripe's test card) through the local webhook, then cancelled; shows the profile's tier after each step, deletes the test customer. |
| `test-billing-portal.mjs` | Creates a real portal session for the admin test user; proves the portal config + API call work. |
