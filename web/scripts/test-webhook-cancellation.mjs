// One-off local verification: simulates a subscription cancellation event.
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const subscriptionId = process.argv[2];

if (!subscriptionId) {
  console.error("Usage: node test-webhook-cancellation.mjs <stripe_subscription_id>");
  process.exit(1);
}

const fakeEvent = {
  id: "evt_test_" + Date.now(),
  object: "event",
  type: "customer.subscription.deleted",
  data: {
    object: {
      id: subscriptionId,
      status: "canceled",
    },
  },
};

const payload = JSON.stringify(fakeEvent);
const header = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

const res = await fetch("http://localhost:3000/api/webhooks/stripe", {
  method: "POST",
  headers: { "Content-Type": "application/json", "stripe-signature": header },
  body: payload,
});

console.log("Webhook response:", res.status, await res.text());
