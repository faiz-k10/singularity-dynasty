import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const TIER_BY_PRICE_ID = {
  [process.env.STRIPE_PRICE_EXPLORER_MONTHLY]: "explorer",
  [process.env.STRIPE_PRICE_EXPLORER_ANNUAL]: "explorer",
  [process.env.STRIPE_PRICE_SINGULARITY_MONTHLY]: "singularity",
  [process.env.STRIPE_PRICE_SINGULARITY_ANNUAL]: "singularity",
};

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

  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 1,
      });
      const priceId = lineItems.data[0]?.price?.id;
      const tier = TIER_BY_PRICE_ID[priceId];

      if (!tier) {
        console.error(
          `[stripe webhook] checkout.session.completed with unrecognized price: ${priceId}`
        );
        break;
      }

      const update = {
        tier,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
      };

      let updated;
      if (session.client_reference_id) {
        ({ data: updated } = await supabase
          .from("profiles")
          .update(update)
          .eq("id", session.client_reference_id)
          .select());
      }

      if (!updated?.length && session.customer_details?.email) {
        ({ data: updated } = await supabase
          .from("profiles")
          .update(update)
          .eq("email", session.customer_details.email)
          .select());
      }

      console.log(
        `[stripe webhook] checkout completed — tier: ${tier}, matched profiles: ${
          updated?.length || 0
        }, customer: ${session.customer_details?.email}`
      );
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const priceId = subscription.items.data[0]?.price?.id;
      const tier = TIER_BY_PRICE_ID[priceId];

      if (!tier) {
        console.error(
          `[stripe webhook] subscription.updated with unrecognized price: ${priceId}`
        );
        break;
      }

      const { data: updated } = await supabase
        .from("profiles")
        .update({ tier })
        .eq("stripe_subscription_id", subscription.id)
        .select();

      console.log(
        `[stripe webhook] subscription updated — id: ${subscription.id}, ` +
          `tier: ${tier}, status: ${subscription.status}, matched profiles: ${
            updated?.length || 0
          }`
      );
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;

      const { data: updated } = await supabase
        .from("profiles")
        .update({
          tier: "stargazer",
          stripe_subscription_id: null,
        })
        .eq("stripe_subscription_id", subscription.id)
        .select();

      console.log(
        `[stripe webhook] subscription cancelled — id: ${subscription.id}, matched profiles: ${
          updated?.length || 0
        }`
      );
      break;
    }

    default:
      console.log(`[stripe webhook] unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
