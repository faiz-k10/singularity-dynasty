# Running Singularity Dynasty

How to run the site week to week on your own. No code and no Claude needed for anything on this page.

## The one place to look: `/admin`

Sign in with your founder email and open **https://web-kohl-ten-94.vercel.app/admin**. Top to bottom:

1. **Site health:** green means the numbers are fresh and nothing is erroring.
2. **Weekly runs:** when each scheduled job last ran, whether it passed, its last lines, and a link to its full log.
3. Members and revenue, the email list and referrals, which paywalls people hit, recent errors, and **Publish** (post a drop, upload the prospect and draft boards).

If those panels look normal, the site is fine.

## What runs by itself, and when

The weekly jobs run on GitHub's computers. Your Mac can be off.

| When (Eastern) | Job | What it does |
|---|---|---|
| Tuesday 1:30 PM | `tuesday` | Loads last week's finished games, then publishes next week's projections and season sims, sends the weekly email (once it's set up) and saves a backup. |
| Wednesday 9 AM | `game-data` | Picks up stat corrections and late numbers from Monday night. |
| Thursday 5 PM | `projections` | Republishes with the latest injury news before Thursday night. |
| Sunday 11 AM | `projections` | Last injury update before the 1 PM games. |

In summer every time is one hour later (GitHub's clock doesn't change for daylight saving). GitHub sometimes starts a scheduled run late or drops it when it's busy, so each job also has one or two later back-up times. A back-up time does nothing if the job already passed that day, and tries again if it failed.

Other automatic checks:
- **About every hour**, GitHub checks that the site is up and the data is fresh. When GitHub is busy this can stretch to every few hours.
- **Every Monday**, GitHub checks the site's software for security problems.

## Your weekly routine (about 2 minutes)

- **Tuesday evening:** open `/admin`. *Weekly runs → Tuesday* should say **Passed** with today's date, and *Site health* should be green. Open Weekly Projection Rankings and check it shows the new week.
- **Any other day:** only if you got an email from GitHub (see below).

## When something goes wrong

GitHub emails you when a run fails or the hourly check fails. Open `/admin` first: the failed job's **Last lines** usually say why.

| What you see | What it means | What to do |
|---|---|---|
| Tuesday **FAILED** with "Week N is not complete" | A game (often Monday night) wasn't final yet, or its stats hadn't posted. Game data was still published; projections were not. | Wait a few hours, then run `tuesday` again by hand (below). |
| A run failed with "CSV has only N rows" or "older than what is live" | The model produced something that looked wrong, so nothing was published. The site still shows the last good week. | Run it again once. If it fails again, it needs a developer: the model or a data source changed. |
| "Add the … repository secrets first" | GitHub doesn't have the database key. | Add the secrets (Setup, below). |
| Hourly check failed: "not ok" or "data is stale" | Rankings are more than 7.5 days old in season, or errors spiked. | Check *Weekly runs*. If Tuesday failed, run `tuesday` by hand. If errors spiked, look at *Recent errors*. |
| Hourly check failed: a page "answered 500" | The site itself is down. | Check Vercel → Deployments: if the newest deployment failed, press **Redeploy** on the last good one (⋯ menu → Redeploy). |
| A member says they paid but still see the free plan | Their payment was processed but their account wasn't upgraded. | Ask them to sign out and back in. Still wrong: find them in Stripe → Customers and check their subscription is Active; tell a developer the email if it is. |
| A refund | – | Stripe → Payments → the payment → Refund. Then **cancel the subscription** (Customers → them → subscription → Cancel now), so their access ends. |
| Someone can't sign in | Usually an unconfirmed email or a forgotten password. | Point them to **Forgot your password?** on the sign-in page. |

### Run a job by hand

GitHub → the repository → **Actions** → **Weekly run** → **Run workflow** → pick the job → **Run workflow**. It shows up in `/admin` when it finishes:

- Projections take about 30 to 45 minutes.
- Game data takes about a minute.

Direct link: https://github.com/faiz-k10/singularity-dynasty/actions/workflows/weekly.yml

**Fallback if GitHub itself is down:** on your Mac, in Terminal, from the `web` folder, run:

```
node --env-file=.env.local scripts/weekly-run.mjs tuesday
```

The other job names also work in place of `tuesday`.

## Things you publish yourself (in `/admin` → Publish)

- **A drop / post:** title and link. It appears in the home page Feed.
- **Prospect rankings or a draft board:** upload the CSV. Every line is checked first, and the old board stays up if anything is wrong. The column format is in `csv-upload-formats.html`.

## Where everything lives

| Service | What it's for | Link |
|---|---|---|
| Vercel | Hosts the site; deploys every change pushed to GitHub | vercel.com → project `web` |
| Supabase | Database and sign-ins | supabase.com/dashboard/project/nkzazbqjupexwnehkktl |
| Stripe | Payments, refunds, subscriptions | dashboard.stripe.com |
| GitHub | The code, the weekly runs, the alerts and the backups | github.com/faiz-k10/singularity-dynasty |
| Resend (once set up) | Sends the weekly email | resend.com |

**Backups:**
- Every Tuesday run saves a copy of every table plus the model files. On GitHub: open that run → **Artifacts** → backup (kept 60 days).
- Older backups made on your Mac are in `Website/Backups/`.

## Setup (one time)

1. **GitHub secrets.** GitHub → repository → Settings → Secrets and variables → Actions → **New repository secret**. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

   Copy both values from `web/.env.local` on your Mac. Once Resend is set up, also add:
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `NEXT_PUBLIC_SITE_URL`
   - `EMAIL_FOOTER_ADDRESS`
2. **Test it.** Run `game-data` by hand (above). It should say Passed in `/admin` within a few minutes.
3. **Turn off the old Claude-run schedules** once a GitHub run has passed (Claude Code desktop app → Scheduled tasks → disable the four weekly ones). Until then they cover for each other:
   - **Tuesday and Sunday:** the Claude task runs first (noon / 10 AM), and GitHub skips if it passed.
   - **Wednesday and Thursday:** GitHub runs first, and the Claude task (renamed "fallback") skips if GitHub passed.

   The email can't send twice either way.

## Once a year

- **New season (August):** nothing to change. The model reads the current season from the NFL schedule. Check the first Tuesday run of week 1 in `/admin`.
- **Before real payments:** follow "Go-live operations" in `CLAUDE.md` (live Stripe keys and the attorney review).
- **If you connect a custom domain:** update `SITE` in `.github/workflows/uptime.yml` and `SITE_URL` in `web/app/layout.js`, and add the new address to Supabase → Authentication → URL Configuration.

## What still needs a developer

New features, changes to the model or its numbers, a data source that stops working (nflverse or Sleeper changing their format), and anything above that a re-run doesn't fix. `CLAUDE.md` is the full technical history for whoever picks that up.
