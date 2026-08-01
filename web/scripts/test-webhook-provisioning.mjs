// One-off local verification: creates a real Stripe Checkout Session (so
// listLineItems in the webhook handler has real data to fetch), then
// constructs and properly signs a checkout.session.completed event
// referencing it, and posts it straight to the local webhook endpoint.
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const testUserId = process.argv[2];
const testUserEmail = process.argv[3];

if (!testUserId || !testUserEmail) {
  console.error("Usage: node test-webhook-provisioning.mjs <user_id> <email>");
  process.exit(1);
}

const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  line_items: [{ price: process.env.STRIPE_PRICE_EXPLORER_MONTHLY, quantity: 1 }],
  success_url: "http://localhost:3000/?checkout=success",
  cancel_url: "http://localhost:3000/?checkout=cancelled",
  client_reference_id: testUserId,
  customer_email: testUserEmail,
});

console.log("Created real checkout session:", session.id);

// Simulate what Stripe sends once this session actually completes payment.
const fakeEvent = {
  id: "evt_test_" + Date.now(),
  object: "event",
  type: "checkout.session.completed",
  data: {
    object: {
      id: session.id,
      client_reference_id: testUserId,
      customer: "cus_test_fake",
      subscription: "sub_test_fake",
      amount_total: 900,
      customer_details: { email: testUserEmail },
    },
  },
};

const payload = JSON.stringify(fakeEvent);
const header = stripe.webhooks.generateTestHeaderString({
  payload,
  secret: webhookSecret,
});

const res = await fetch("http://localhost:3000/api/webhooks/stripe", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "stripe-signature": header,
  },
  body: payload,
});

console.log("Webhook response:", res.status, await res.text());
