import { NextResponse } from "next/server";
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
//   - a first-time subscriber who came through a friend's link (lib/referrals.js) gets the friend discount; the friend's
//     reward is paid when this subscription is (lib/billing.js provisionFromCheckout)
export async function POST(request) {
  const site = request.nextUrl.origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== site) {
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
  const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  const customer = profile?.stripe_customer_id || null;

  try {
    if ((await liveSubscriptions(customer)).length) {
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${site}/account` });
      return NextResponse.json({ url: portal.url, portal: true });
    }

    // Referral: recorded at sign-up, or (signed up before clicking the link) from the link's cookie now. Only a first-ever
    // subscription counts -- Stripe's own history decides, not the profile.
    const referral = (await referralOf(user.id)) || (await recordReferral(user.id, request.cookies.get(REF_COOKIE)?.value));
    const subscribedBefore = customer ? (await stripe.subscriptions.list({ customer, status: "all", limit: 1 })).data.length > 0 : false;
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
      ...(customer ? { customer } : { customer_email: user.email }),
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
