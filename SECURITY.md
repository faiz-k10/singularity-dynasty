# Security and incident playbook

The plain-English companion to `RUNBOOK.md`. It covers what protects the site and its members, what an attack or a breakdown looks like, and what to do about each. Last full audit: **Nov 16 2026**. Redo the audit when payments go live, when a new kind of member data is stored, and once a year.

---

## 1. What protects you and your members today

| Layer | What it does |
|---|---|
| **Database rules (row-level security)** | Every table has rules on it. A stranger holding the public key can read only the free public data (game log, player directory, defense leans, actual production). Profiles, saved leagues, referrals, the email list, error logs, the Night Sky and every paid model table return nothing to them. Inserts and edits are refused. *Re-tested Nov 16 2026.* |
| **Members can't change their own plan** | The `tier` column can only be written by the server after Stripe confirms a payment (migration 0038). A member editing their own profile through the API gets "permission denied". |
| **Payments** | Checkout needs an account and must come from this site. The Stripe webhook is verified by signature, and every event is re-read from Stripe instead of trusted. A failed or unpaid subscription drops to Stargazer. One subscription can never sit on two accounts (unique index, 0041). |
| **Paywalls are on the server** | Locked rows are never sent to a free visitor's browser. Every gated API route and share card checks the plan on the server. |
| **Secrets** | The database master key, the Stripe key and the webhook secrets live only in Vercel and GitHub secrets. None is in the code, the git history or anything sent to a browser. The two files that use them refuse to run in a browser. |
| **Sign-in** | Cloudflare Turnstile runs on sign-in, sign-up, password reset and the quiz. There are attempt limits per address AND per email on sign-in (20 / 10 min per address, 8 / 15 min per email), sign-up and reset (6 / hour per address, 3 / hour per email). Sign-in pages only ever show our own fixed messages. The password reset gives the same answer whether or not the email has an account. Passwords are 8+ characters. |
| **Links** | After sign-in, `next=` links can only go to a page on this site. Tricks like a hidden tab character are refused (an open redirect fixed Nov 16 2026, with a test). |
| **Browser headers** | The site can't be framed (no clickjacking of the pay buttons), forms can only post to this site or Stripe, HTTPS is forced, there's no MIME sniffing, and full addresses never leak to other sites. |
| **Abuse limits** | There are per-address limits on the Sleeper lookup, share uploads, share cards (plus 40 cards a day per account), the newsletter, crash reports and telemetry. Share uploads need an account. |
| **Night Sky prizes** | Prizes are checked against real progress on the server. Beat-the-Model picks close when either player's game kicks off (fixed Nov 16 2026: picks used to stay open through Monday night). |
| **Privacy** | Deleting an account cancels billing, deletes the Stripe customer and saved cards, deletes every row tied to the login, and (since Nov 16 2026) removes their newsletter entry. Telemetry stores the page path only, never an IP. Unsubscribe links can't be guessed (36-character random token) and need a click (mail scanners can't unsubscribe people). |
| **Dependencies** | `npm audit` runs on every push and every Monday, and fails on any high or critical advisory in what the site runs. Next.js was updated to 16.4.6 on Nov 16 2026 (a moderate cache information leak was fixed). The 7 moderate advisories left are in lint tooling that never ships. |
| **Automation** | GitHub workflows run with a read-only token. A broken publish job can't push code. |
| **Watching** | The hourly uptime check (and `/api/health`) emails you if a page is down, the week's data is late or has gaps, or server errors spike. `/admin` shows errors, runs, payments and failures. |

---

## 2. Attacks: what they look like and what stops them

| # | Attack | What stops it now | What you do if you see it |
|---|---|---|---|
| A1 | **Password guessing** on a member's account | Turnstile + per-email and per-address attempt limits + Supabase's own limits. | Nothing usually. If a member reports a break-in: Supabase → Authentication → Users → their account → **Sign out user** (ends every session), then have them reset their password. |
| A2 | **Credential stuffing** (passwords leaked from other sites, tried across many accounts) | Turnstile (a bot has to solve a challenge per attempt), per-address limits. | Supabase → Auth → turn on **Leaked password protection** (Pro plan). If sign-in errors spike in `/admin`, turn on Vercel **Attack Challenge Mode** (Vercel → project → Firewall). |
| A3 | **Fake sign-ups / bots** burning your email quota | Turnstile, a hidden bot trap field, a "too fast to be human" check, sign-up limits. | Supabase → Auth → **Rate limits** → lower "emails per hour". Turnstile is enforced by Supabase itself (verified Nov 16 2026). |
| A4 | **Getting paid features for free** (editing your own plan, calling locked APIs, reading paid tables directly) | Plan is server-written only; tables locked (0044); every gate is on the server. *All tested.* | If someone shows paid data they shouldn't have, check `/admin` → members for an odd tier, then look at their Stripe subscription. |
| A5 | **Card testing** (a fraudster runs stolen cards through your checkout) | Checkout needs an account; Stripe Radar is on by default. | Stripe → Radar → add a rule "Block if :card_count_for_ip_address_daily: > 3", and turn on 3-D Secure for high-risk cards. Refund and block anything flagged. |
| A6 | **Chargeback / refund abuse** of the referral reward | Rewards pay only after the friend's first payment is 14+ days old, never refunded, still subscribed, and on a different card from the referrer. | After refunding anyone, **cancel the subscription immediately** in Stripe so access ends. |
| A7 | **Account sharing** (one paid login used by many people) | Not blocked (no session limit). | Low risk at this size. Supabase Pro can cap sessions per user later (Auth → Sessions → single session per user). |
| A8 | **Scraping the paid board** | Paid rows never reach free visitors. Share cards are capped at 40 a day per account. | A member who scrapes their own access is a terms-of-service issue: cancel the subscription in Stripe and ban the user in Supabase. |
| A9 | **Phishing** with a link that looks like ours | `next=` links can't leave the site. Sign-in pages show only our own messages. | Report fake domains to the registrar. Never ask members for passwords by email (put that line in the welcome email). |
| A10 | **Flooding the site** (denial of service) | Vercel's network absorbs most of it. Heavy routes are cached or limited. | Vercel → Firewall → **Attack Challenge Mode** on, then off once it passes. Set a **Spend Management** cap in Vercel so an attack can't run up a bill. |
| A11 | **Stolen key** (database master key, Stripe key, webhook secret) | Keys live only in Vercel / GitHub / your Mac. | See section 4, "A key has leaked": rotate immediately. |
| A12 | **Your own account taken over** (you're the admin) | `/admin` needs your confirmed email and a live session. Every admin action re-checks. | **Do now:** use a unique password plus two-factor on your email, GitHub, Vercel, Supabase, Stripe, Cloudflare and Resend. Anyone who gets into your email can reset everything else. |
| A13 | **Malicious package** (a dependency gets hijacked) | Exact version pins, a committed lock file, the audit in CI, and npm's install-script blocking. | If CI's audit fails: run `npm audit` and update the named package. Never install a package you didn't ask for. |
| A14 | **Script injection (XSS)** | React escapes everything. The few raw-HTML spots only use our own artwork or escaped names. No user text is ever written into a page raw. | If a page ever shows odd HTML from a name or caption, tell Claude; it would be a code fix. |

---

## 3. Breakdowns: what they look like and what to do

| # | Breakdown | How you'll know | What to do |
|---|---|---|---|
| M1 | **The weekly publish failed** | A GitHub email, a red run in `/admin`, or a health check failing "rankings published N days ago". | `/admin` → Weekly runs → open the log. Re-run it from GitHub → Actions → Weekly → Run workflow. `RUNBOOK.md` → "When something goes wrong". |
| M2 | **A week of data is missing or doubled** | The health check fails with "week N missing". | Re-run `projections-only` for that week. Tuesday backups are in GitHub Actions artifacts (60 days) and `Backups/` on your Mac. |
| M3 | **Stripe webhook not arriving** (someone paid but is still Stargazer) | A member writes in, or Stripe → Developers → Webhooks shows failures. | The account page fixes itself when they return from checkout. Otherwise click **Resend** on the failed event in Stripe. Check `STRIPE_WEBHOOK_SECRET` in Vercel matches the endpoint's secret. |
| M4 | **Sign-up emails not arriving** | Members say they never got the confirm or reset email. | Supabase's built-in sender allows only a few emails an hour. Set custom SMTP (Resend) in Supabase → Auth → SMTP. |
| M5 | **Turnstile blocks everyone** ("Unable to connect to website") | The sign-in page shows the error. | Cloudflare → Turnstile → the widget → Hostnames must include every domain the site runs on. In an emergency, switch off captcha in Supabase so people can sign in while you fix it. |
| M6 | **Sleeper or ESPN down or changed** | Game Board scores freeze, the lookup fails, "No box-score line yet". | Nothing to do on our side. The site keeps its last good copy and never shows a crash. If it lasts more than a day, tell Claude (an API may have changed). |
| M7 | **Supabase down or over its plan limit** | Pages answer slowly or empty. `/admin` errors rise. | status.supabase.com, then the Supabase usage page. Cached pages keep serving the last good data for an hour. |
| M8 | **Vercel down / bad deploy** | Uptime emails, pages error. | Vercel → Deployments → the last good one → **Promote to Production** (instant rollback). |
| M9 | **Error spike after a change** | Health check "25+ errors in the last hour", `/admin` error list. | Roll back (M8) first, then fix. Each error has a reference that matches the Vercel log. |
| M10 | **Domain or SSL problem** | The site is unreachable on dynastysingularity.com but works on the vercel.app address. | Cloudflare DNS must be "DNS only" (grey cloud) to Vercel. Check the domain hasn't expired (auto-renew on). |
| M11 | **Database lost or corrupted** | Tables empty or wrong. | Restore the newest `Backups/auto-db_*` (weekly). Supabase Pro adds daily restorable backups, so upgrade before you have paying members. |
| M12 | **Bill shock** (Vercel / Supabase usage) | A usage email from either. | Set spend caps in both dashboards now, so a spike pauses the site instead of charging you without limit. |

---

## 4. If the worst happens

**A key has leaked** (pasted somewhere public, a laptop lost, a contractor left):
1. **Supabase service-role key:** Supabase → Project Settings → API → roll the key. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel, GitHub secrets and `web/.env.local`, then redeploy. Share-card links and the revalidate token are derived from it, so old share cards stop working. That's expected.
2. **Stripe secret key:** Stripe → Developers → API keys → roll. Update `STRIPE_SECRET_KEY` in Vercel and redeploy.
3. **Stripe webhook secret:** Stripe → Webhooks → the endpoint → roll the signing secret, then update `STRIPE_WEBHOOK_SECRET`.
4. Check Stripe → Payments and Supabase → logs for anything you didn't do.

**Member data was exposed:**
1. Stop it first: rotate keys, lock the table, or roll back the deploy.
2. Write down what was exposed, for whom, and when.
3. Tell affected members promptly and plainly. Several US states require notice for exposed emails plus passwords or payment data. We never hold card numbers (Stripe does), and passwords are hashed by Supabase. Ask your attorney about notice duties.
4. Have them reset their password (Supabase can force sign-out for everyone: Auth → Sessions).

**Your admin account was taken over:** recover your email first, then reset the site password, sign out all sessions in Supabase, check `/admin` publishing history (posts, boards) and Stripe for changes, and rotate the keys above if you think the attacker got into Vercel or Supabase.

---

## 5. Your to-do list (dashboards only; Claude can't do these)

In order of importance:
1. **Two-factor authentication** on your email, GitHub, Vercel, Supabase, Stripe, Cloudflare and Resend.
2. ~~Supabase captcha~~ **already ON** (verified Nov 16 2026: a sign-in without a Turnstile token is refused by Supabase itself).
3. **Supabase → Auth:** turn on leaked-password protection, and set custom SMTP (Resend) before launch.
4. **Spend caps** in Vercel (Spend Management) and Supabase (usage limits).
5. **Stripe Radar rule** against card testing (A5) when you go live.
6. **Supabase Pro** before paying members: daily restorable backups and leaked-password checks. **Vercel Pro** is required for commercial use.
7. Replace the personal Gmail on the Contact page with a support address on your domain.

## 6. Known and accepted (revisit as you grow)
- **Rate limits are per server instance** (in memory). They stop casual abuse, not a large coordinated attack. The next step would be Vercel Firewall rate-limit rules or a table-backed limit.
- **A per-email sign-in limit can be tripped by someone else**, locking that member out for 15 minutes. That's the usual trade-off; Turnstile makes it costly to do.
- **No strict script policy (CSP script-src):** Next.js would need a nonce on every page, which turns off page caching. React's escaping is the main XSS defence.
- **Shared Observatory pictures stay public until the 90-day cleanup** (`scripts/clean-lab-shares.mjs`, not yet scheduled). They carry no personal data.
- **Payment card data never touches our servers** (Stripe Checkout and the Portal handle it), which keeps the site out of most PCI scope.
