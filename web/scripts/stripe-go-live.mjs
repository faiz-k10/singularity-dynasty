// Switch Stripe from test to live in one run. YOU run this (it needs your LIVE secret key, which never goes in a file Claude reads):
//
//   1. Stripe dashboard -> switch off "Test mode" -> Developers -> API keys -> copy the live Secret key (sk_live_...).
//   2. In a terminal, from web/:
//        STRIPE_SECRET_KEY=sk_live_... SITE_URL=https://web-kohl-ten-94.vercel.app node scripts/stripe-go-live.mjs
//      (use your custom domain for SITE_URL once it is connected)
//   3. Put the lines it prints into Vercel -> Project "web" -> Settings -> Environment Variables (Production), plus
//      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = your live publishable key (pk_live_...), then redeploy.
//   4. Keep web/.env.local on the TEST keys so local development can never charge a real card.
//
// It does, in live mode and safely re-runnable: the Explorer / Singularity products and their monthly / annual prices
// (create-stripe-products.mjs), the Customer Portal configuration (setup-billing-portal.mjs), and the webhook endpoint at
// <SITE_URL>/api/webhooks/stripe for the three events app/api/webhooks/stripe/route.js handles. A webhook's signing secret is only shown
// when the endpoint is created -- if one already exists, roll its secret in the dashboard instead.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY || "";
const site = (process.env.SITE_URL || "").replace(/\/+$/, "");
if (!/^(sk|rk)_live_/.test(key)) {
  console.error("Refusing: STRIPE_SECRET_KEY must be a LIVE key (sk_live_...). This script only sets up live mode.");
  process.exit(1);
}
if (!/^https:\/\//.test(site)) {
  console.error("Refusing: SITE_URL must be the live https address, e.g. SITE_URL=https://web-kohl-ten-94.vercel.app");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
for (const script of ["create-stripe-products.mjs", "setup-billing-portal.mjs"]) {
  console.log(`\n--- ${script} (live) ---`);
  const r = spawnSync(process.execPath, [path.join(here, script)], { env: { ...process.env, STRIPE_SECRET_KEY: key }, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}

const EVENTS = ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"];
const stripe = new Stripe(key);
const url = `${site}/api/webhooks/stripe`;
console.log(`\n--- webhook endpoint (live) ---`);
const existing = (await stripe.webhookEndpoints.list({ limit: 100 })).data.find((w) => w.url === url && w.status === "enabled");
if (existing) {
  const missing = EVENTS.filter((e) => !existing.enabled_events.includes(e) && !existing.enabled_events.includes("*"));
  if (missing.length) await stripe.webhookEndpoints.update(existing.id, { enabled_events: [...new Set([...existing.enabled_events, ...missing])] });
  console.log(`Webhook endpoint already exists (${existing.id}) for ${url}.`);
  console.log("Its signing secret can't be read back: Stripe dashboard -> Developers -> Webhooks -> this endpoint -> Roll secret, then set STRIPE_WEBHOOK_SECRET in Vercel.");
} else {
  const created = await stripe.webhookEndpoints.create({ url, enabled_events: EVENTS, description: "Singularity Dynasty tier provisioning" });
  console.log(`Created webhook endpoint ${created.id} -> ${url}`);
  console.log(`\nSet this in Vercel (Production):\nSTRIPE_WEBHOOK_SECRET=${created.secret}`);
}
console.log("\nAlso set in Vercel (Production): STRIPE_SECRET_KEY (live), NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_live_...) and the four STRIPE_PRICE_* lines printed above. Then redeploy.");
