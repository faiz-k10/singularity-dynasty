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
| `publish-rankings.mjs` | `redraft_rankings`, `best_ball_rankings` | Updates rows by `(player_name, season, week)`. Reads `model/upload_redraft_rankings.csv` / `upload_best_ball_rankings.csv`. |
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
| `test-webhook-provisioning.mjs <user_id> <email>` | Signs a fake `checkout.session.completed` and posts it to the local webhook; asserts the tier gets provisioned. |
| `test-webhook-cancellation.mjs <user_id>` | Same, for `customer.subscription.deleted` → tier reverts to Stargazer. |
| `test-billing-portal.mjs` | Creates a real portal session for the admin test user; proves the portal config + API call work. |
