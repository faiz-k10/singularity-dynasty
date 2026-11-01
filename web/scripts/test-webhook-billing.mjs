// End-to-end check of the Stripe webhook against REAL test-mode objects (test keys only -- refuses a live key):
//   1. creates a test customer paying with Stripe's test card and an Explorer subscription (active)
//   2. sends a signed customer.subscription.updated event to the local webhook  -> the profile should become Explorer
//   3. cancels the subscription and sends customer.subscription.deleted         -> the profile should drop to Stargazer
//   4. deletes the test customer
// With no user id the webhook still runs every step and matches no profile (a dry run of the plumbing).
//
//   node --env-file=.env.local scripts/test-webhook-billing.mjs [user_id]     (the app must be running; BASE_URL, default http://localhost:3000)
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const key = process.env.STRIPE_SECRET_KEY || "";
if (!key.startsWith("sk_test_")) {
  console.error("Refusing: this script only runs with a TEST secret key (sk_test_...).");
  process.exit(1);
}
const stripe = new Stripe(key);
const BASE = process.env.BASE_URL || "http://localhost:3000";
const userId = process.argv[2] || null;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function send(type, object) {
  const payload = JSON.stringify({ id: `evt_test_${Date.now()}`, object: "event", type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const res = await fetch(`${BASE}/api/webhooks/stripe`, { method: "POST", headers: { "stripe-signature": header }, body: payload });
  console.log(`${type} -> HTTP ${res.status} ${await res.text()}`);
  if (userId) {
    const { data } = await admin.from("profiles").select("tier, stripe_subscription_id").eq("id", userId).single();
    console.log(`   profile now: ${JSON.stringify(data)}`);
  }
}

const customer = await stripe.customers.create({ email: "billing-test@example.com", payment_method: "pm_card_visa", invoice_settings: { default_payment_method: "pm_card_visa" } });
try {
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: process.env.STRIPE_PRICE_EXPLORER_MONTHLY }],
    metadata: userId ? { user_id: userId } : {},
  });
  console.log(`subscription ${sub.id}: ${sub.status}`);
  await send("customer.subscription.updated", sub);
  const ended = await stripe.subscriptions.cancel(sub.id);
  console.log(`cancelled: ${ended.status}`);
  await send("customer.subscription.deleted", ended);
  console.log("unsigned event:", (await fetch(`${BASE}/api/webhooks/stripe`, { method: "POST", body: "{}" })).status, "(expect 400)");
} finally {
  await stripe.customers.del(customer.id);
  console.log(`deleted test customer ${customer.id}`);
}
