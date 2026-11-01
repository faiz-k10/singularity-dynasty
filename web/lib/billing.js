import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { subscriptionTier } from "@/lib/subscriptionTier";

// Server-only: everything that turns a Stripe subscription into a profile's tier. The Stripe webhook
// (app/api/webhooks/stripe) and the checkout return page (app/account) both go through here, so there is one rule
// (lib/subscriptionTier.js) and one place that writes `tier` -- the profiles row itself can't be changed by its owner
// (migration 0038).

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const PRICE_IDS = {
  explorer: { monthly: process.env.STRIPE_PRICE_EXPLORER_MONTHLY, annual: process.env.STRIPE_PRICE_EXPLORER_ANNUAL },
  singularity: { monthly: process.env.STRIPE_PRICE_SINGULARITY_MONTHLY, annual: process.env.STRIPE_PRICE_SINGULARITY_ANNUAL },
};
const TIER_BY_PRICE = Object.fromEntries(
  Object.entries(PRICE_IDS).flatMap(([tier, byBilling]) => Object.values(byBilling).filter(Boolean).map((id) => [id, tier]))
);

// Statuses after which a subscription can never come back; its id is cleared from the profile.
const FINAL = new Set(["canceled", "incomplete_expired"]);

function check({ error }) {
  if (error) throw new Error(`profiles update failed: ${error.message}`);
}

// Writes one subscription's CURRENT state (always re-read from Stripe, so webhook events arriving out of order can't leave
// an old status behind) onto its profile. userId = the account it was bought by, when known (checkout's
// client_reference_id, or the user_id our checkout puts in the subscription's metadata).
//   paid status   -> that account gets the plan, the customer id and this subscription id
//   anything else -> only the profile that holds THIS subscription drops to Stargazer, so an old subscription ending can
//                    never downgrade an account that has since subscribed again
// Throws on a database error so the webhook answers 500 and Stripe retries.
export async function syncSubscription(subscriptionId, { userId = null } = {}) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const tier = subscriptionTier(sub, TIER_BY_PRICE);
  const owner = userId || sub.metadata?.user_id || null;
  const admin = createAdminClient();
  let matched = 0;
  if (tier !== "stargazer") {
    const update = { tier, stripe_customer_id: sub.customer, stripe_subscription_id: sub.id };
    const res = owner
      ? await admin.from("profiles").update(update).eq("id", owner).select("id")
      : await admin.from("profiles").update(update).eq("stripe_subscription_id", sub.id).select("id");
    check(res);
    matched = res.data?.length || 0;
  } else {
    const res = await admin
      .from("profiles")
      .update({ tier: "stargazer", ...(FINAL.has(sub.status) ? { stripe_subscription_id: null } : {}) })
      .eq("stripe_subscription_id", sub.id)
      .select("id");
    check(res);
    matched = res.data?.length || 0;
  }
  console.log(`[billing] subscription ${sub.id} status=${sub.status} tier=${tier} owner=${owner || "-"} matched=${matched}`);
  return { tier, matched, status: sub.status };
}

// A finished Checkout Session -> the buyer's profile. expectedUserId (the return page) refuses a session that belongs to
// someone else, so pasting another person's session_id into the URL does nothing. Returns syncSubscription's result, or
// null when the session isn't a completed subscription checkout of ours.
export async function provisionFromCheckout(sessionOrId, { expectedUserId = null } = {}) {
  const session = typeof sessionOrId === "string" ? await stripe.checkout.sessions.retrieve(sessionOrId) : sessionOrId;
  if (session.mode !== "subscription" || session.status !== "complete" || !session.subscription) return null;
  const userId = session.client_reference_id || session.metadata?.user_id || null;
  if (expectedUserId && userId !== expectedUserId) return null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  if (!userId) {
    // Checkouts from before sign-in was required carry no account id; match the buyer's email once so the subscription id
    // lands on the profile, after which every later event matches by subscription id.
    const email = session.customer_details?.email;
    if (email) {
      check(await createAdminClient().from("profiles").update({ stripe_subscription_id: subscriptionId }).eq("email", email).select("id"));
    }
  }
  return syncSubscription(subscriptionId, { userId });
}

// The account's subscriptions in Stripe that are still running (the profile could be out of date). Used to stop a second
// subscription: those customers manage or switch plans in the billing portal. An "incomplete" one (first payment failed)
// doesn't count -- it expires by itself and the buyer should be able to try again.
export async function liveSubscriptions(customerId) {
  if (!customerId) return [];
  const { data } = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  return data.filter((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status));
}
