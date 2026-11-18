import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/siteOrigin";
import { allowHit } from "@/lib/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { stripe, PRICE_IDS, liveSubscriptions } from "@/lib/billing";
import { referralOf, recordReferral, ensureReferralCoupon } from "@/lib/referrals";
import { REF_COOKIE, referralApplies } from "@/lib/referralRules";

// Starts a Stripe Checkout for Explorer or Singularity. Rules:
//   - an account is required (the webhook matches the subscription to it by id; signed-out buyers used to pay and never
//     be upgraded) -> 401 with where to sign in
//   - someone who already has a running subscription gets the billing portal instead (switch or cancel there, prorated),
//     never a second subscription that bills alongside the first
//   - a returning customer reuses their Stripe customer, so the portal shows one history
//   - the request must come from this site (the Origin header browsers send on a POST)
//   - only ONE checkout page can be open per account: the Stripe customer is made up front and any earlier unfinished checkout
//     page is closed, so paying in two tabs can't start two subscriptions (security pass, Nov 17 2026)
//   - 10 checkout starts per account per 10 minutes, so a script can't fill the Stripe account with sessions
//   - return links only ever point at this site (lib/siteOrigin.js)
//   - a first-time subscriber who came through a friend's link (lib/referrals.js) gets the friend discount; the friend's
//     reward is paid when this subscription is (lib/billing.js provisionFromCheckout)
const hits = new Map();

export async function POST(request) {
  const site = await siteOrigin();
  const origin = request.headers.get("origin");
  if (origin && origin !== site && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { plan, billing } = body || {};
  const priceId = PRICE_IDS[plan]?.[billing];
  if (!priceId) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to subscribe.", login: "/login?next=%2F%23pricing" }, { status: 401 });
  }
  if (!allowHit(hits, user.id, Date.now(), 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many checkout attempts. Try again in a few minutes." }, { status: 429 });
  }
  const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  let customer = profile?.stripe_customer_id || null;

  try {
    // one Stripe customer per account, made before the first checkout (the idempotency key means a double click makes one)
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } }, { idempotencyKey: `sd-customer-${user.id}` });
      customer = c.id;
      const admin = createAdminClient();
      await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id).is("stripe_customer_id", null);
      const { data: again } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
      customer = again?.stripe_customer_id || customer; // another request may have saved its customer first
    }
    if ((await liveSubscriptions(customer)).length) {
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${site}/account` });
      return NextResponse.json({ url: portal.url, portal: true });
    }

    // Referral: recorded at sign-up, or (signed up before clicking the link) from the link's cookie now. Only a first-ever
    // subscription counts -- Stripe's own history decides, not the profile.
    const referral = (await referralOf(user.id)) || (await recordReferral(user.id, request.cookies.get(REF_COOKIE)?.value));
    const subscribedBefore = (await stripe.subscriptions.list({ customer, status: "all", limit: 1 })).data.length > 0;
    // close any checkout page this account left open, so only the newest one can be paid
    for (const old of (await stripe.checkout.sessions.list({ customer, status: "open", limit: 20 })).data) await stripe.checkout.sessions.expire(old.id).catch(() => {});
    const discount = referralApplies({ referrerId: referral?.referrer_id, userId: user.id, subscribedBefore }) ? await ensureReferralCoupon().catch(() => null) : null;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${site}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/?checkout=cancelled#pricing`,
      client_reference_id: user.id,
      metadata: { user_id: user.id, ...(discount ? { referrer_id: referral.referrer_id } : {}) },
      subscription_data: { metadata: { user_id: user.id, ...(discount ? { referrer_id: referral.referrer_id } : {}) } }, // the referral reward checks this (lib/referrals.js)
      ...(discount ? { discounts: [{ coupon: discount }] } : {}),
      customer,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
