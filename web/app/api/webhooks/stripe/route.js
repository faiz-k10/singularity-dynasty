import { NextResponse } from "next/server";
import { stripe, syncSubscription, provisionFromCheckout } from "@/lib/billing";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Stripe -> profiles.tier. Every event is verified against the webhook signing secret, and the handlers re-read the
// subscription from Stripe instead of trusting the event body's status (lib/billing.js), so retries and out-of-order
// delivery settle on Stripe's current state. A database failure answers 500, which makes Stripe retry (it retries for up
// to three days); everything else answers 200.
export async function POST(request) {
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await provisionFromCheckout(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncSubscription(event.data.object.id, { userId: event.data.object.metadata?.user_id || null });
        break;
      default:
        console.log(`[stripe webhook] unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe webhook] ${event.type} ${event.id} failed:`, err.message);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
