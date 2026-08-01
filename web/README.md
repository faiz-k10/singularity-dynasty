# Singularity Dynasty — web app

Next.js 16 app for the Singularity Dynasty landing page, Stripe checkout, and Supabase auth. See the root [`CLAUDE.md`](../CLAUDE.md) for full project context.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in your own Stripe/Supabase keys
npm run dev
```

Runs at [http://localhost:3000](http://localhost:3000).

## Local webhook testing

Stripe CLI (`~/bin/stripe` if not on PATH):

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Or use the scripts in `scripts/` to exercise checkout/webhook logic directly without a browser:

```bash
node --env-file=.env.local scripts/create-test-user.mjs
node --env-file=.env.local scripts/test-webhook-provisioning.mjs <user_id> <email>
node --env-file=.env.local scripts/check-profile.mjs <user_id>
```

## Database

Schema lives in `supabase/migrations/`. Apply via the Supabase SQL Editor (copy/paste) or `supabase db push` once the CLI is authenticated.

## Deploy

Vercel, connected to this repo. Set the same variables from `.env.local.example` in the Vercel project settings, and register a production webhook endpoint in the Stripe Dashboard pointing at `https://<your-domain>/api/webhooks/stripe`.
