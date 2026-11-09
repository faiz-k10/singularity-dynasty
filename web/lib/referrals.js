import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripeClient";
import { makeCode, isReferralCode, rewardFor, rewardDecision, REWARD_CAP_PER_YEAR, COUPON_ID, FRIEND_DISCOUNT_PERCENT } from "@/lib/referralRules";

// Server-only: the referral program's database and Stripe side (rules in lib/referralRules.js). Tables `referrals` and
// `profiles.referral_code` (migration 0043) are service-role only.

// The member's personal code, made the first time it's needed. Retries on the (unlikely) clash with another member's code.
export async function ensureReferralCode(userId) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("referral_code").eq("id", userId).maybeSingle();
  if (data?.referral_code) return data.referral_code;
  for (let i = 0; i < 5; i++) {
    const code = makeCode(randomBytes(8));
    const { data: set, error } = await admin.from("profiles").update({ referral_code: code }).eq("id", userId).is("referral_code", null).select("referral_code");
    if (!error && set?.length) return code;
    if (!error) {
      const { data: again } = await admin.from("profiles").select("referral_code").eq("id", userId).maybeSingle();
      if (again?.referral_code) return again.referral_code; // set by a parallel request
    }
  }
  return null;
}

async function referrerByCode(admin, code) {
  if (!isReferralCode(code)) return null;
  const { data } = await admin.from("profiles").select("id").eq("referral_code", code).maybeSingle();
  return data?.id || null;
}

// Records that `userId` came through `code`. First one wins (referred_id is unique); self-referral is ignored. Never throws.
export async function recordReferral(userId, code) {
  try {
    const admin = createAdminClient();
    const referrerId = await referrerByCode(admin, code);
    if (!referrerId || referrerId === userId) return null;
    await admin.from("referrals").upsert({ referrer_id: referrerId, referred_id: userId }, { onConflict: "referred_id", ignoreDuplicates: true });
    const { data } = await admin.from("referrals").select("referrer_id, status").eq("referred_id", userId).maybeSingle();
    return data || null;
  } catch (e) {
    console.error("[referrals] record:", e?.message || e);
    return null;
  }
}

export async function referralOf(userId) {
  const { data } = await createAdminClient().from("referrals").select("referrer_id, status").eq("referred_id", userId).maybeSingle();
  return data || null;
}

// The friend's coupon, created in Stripe the first time it's needed (test and live each get their own), then remembered.
let couponReady = null;
export function ensureReferralCoupon() {
  couponReady ??= stripe.coupons
    .retrieve(COUPON_ID)
    .catch(() => stripe.coupons.create({ id: COUPON_ID, percent_off: FRIEND_DISCOUNT_PERCENT, duration: "once", name: `Referral: ${FRIEND_DISCOUNT_PERCENT}% off your first payment` }))
    .then(() => COUPON_ID)
    .catch((e) => {
      couponReady = null;
      throw e;
    });
  return couponReady;
}

// Card fingerprints a Stripe customer has paid with or saved (the same physical card has the same fingerprint everywhere).
async function cardsOf(customer) {
  const out = new Set();
  if (!customer) return out;
  const [pms, charges] = await Promise.all([
    stripe.paymentMethods.list({ customer, type: "card", limit: 20 }).catch(() => ({ data: [] })),
    stripe.charges.list({ customer, limit: 20 }).catch(() => ({ data: [] })),
  ]);
  for (const pm of pms.data) if (pm.card?.fingerprint) out.add(pm.card.fingerprint);
  for (const c of charges.data) if (c.payment_method_details?.card?.fingerprint) out.add(c.payment_method_details.card.fingerprint);
  return out;
}

// Where one referral stands (rewardDecision in lib/referralRules.js): reads the friend's subscription and charges from Stripe.
async function decide(admin, referredId, referrer) {
  const { data: friend } = await admin.from("profiles").select("stripe_customer_id, stripe_subscription_id").eq("id", referredId).maybeSingle();
  if (!friend?.stripe_customer_id || !friend?.stripe_subscription_id) return "wait";
  const [sub, charges, referrerCards] = await Promise.all([
    stripe.subscriptions.retrieve(friend.stripe_subscription_id),
    stripe.charges.list({ customer: friend.stripe_customer_id, limit: 20 }),
    cardsOf(referrer.stripe_customer_id),
  ]);
  return rewardDecision({
    now: Date.now(),
    referrerId: referrer.id,
    sub: { status: sub.status, referrerId: sub.metadata?.referrer_id || null },
    charges: charges.data.map((c) => ({ paid: c.paid, status: c.status, refunded: c.refunded, amountRefunded: c.amount_refunded, created: c.created, fingerprint: c.payment_method_details?.card?.fingerprint || null })),
    referrerCards,
  });
}

// Pays the referrer once `referredId`'s first payment has stood for the refund window (rewardDecision): one month of the
// referrer's plan as Stripe account credit. Called when the friend's checkout completes (too early: it waits), on every later
// subscription event of the friend (a renewal settles it) and when the referrer opens their account page (settleReferrals).
// A referral that will never pay ("void": refunded, cancelled, the referrer's own card) is closed with no credit. Exactly
// once: the referral row is claimed (joined -> rewarded) before Stripe is called, and the credit carries an idempotency key;
// if Stripe fails the claim is undone and the error thrown, so the webhook answers 500 and Stripe retries the event.
export async function rewardReferral(referredId) {
  const admin = createAdminClient();
  const { data: row } = await admin.from("referrals").select("referrer_id, status").eq("referred_id", referredId).maybeSingle();
  if (!row || row.status !== "joined") return null;
  const { data: referrer } = await admin.from("profiles").select("id, email, tier, stripe_customer_id").eq("id", row.referrer_id).maybeSingle();
  if (!referrer) return null;
  const decision = await decide(admin, referredId, referrer);
  if (decision === "wait") return { pending: true };
  if (decision === "void") {
    await admin.from("referrals").update({ status: "rewarded", rewarded_at: new Date().toISOString(), reward_cents: 0 }).eq("referred_id", referredId).eq("status", "joined");
    console.log(`[referrals] closed without a reward: ${referredId} (refunded, ended, not a referred checkout, or the referrer's own card)`);
    return { cents: 0, void: true };
  }

  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const { count } = await admin.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", referrer.id).eq("status", "rewarded").gt("reward_cents", 0).gte("rewarded_at", yearAgo);
  const cents = (count ?? 0) >= REWARD_CAP_PER_YEAR ? 0 : rewardFor(referrer.tier);

  const { data: claimed } = await admin
    .from("referrals")
    .update({ status: "rewarded", rewarded_at: new Date().toISOString(), reward_cents: cents })
    .eq("referred_id", referredId)
    .eq("status", "joined")
    .select("id");
  if (!claimed?.length) return null; // someone else (the other of webhook / return page) got here first
  if (!cents) return { cents: 0, capped: true };

  try {
    let customer = referrer.stripe_customer_id;
    if (!customer) {
      // A free member has no Stripe customer yet: make one so the credit waits for their first subscription.
      const c = await stripe.customers.create({ email: referrer.email, metadata: { user_id: referrer.id } }, { idempotencyKey: `sd-customer-${referrer.id}` });
      customer = c.id;
      await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", referrer.id).is("stripe_customer_id", null);
    }
    await stripe.customers.createBalanceTransaction(
      customer,
      { amount: -cents, currency: "usd", description: "Referral reward: a friend subscribed", metadata: { referred_user: referredId } },
      { idempotencyKey: `sd-referral-${referredId}` }
    );
    console.log(`[referrals] rewarded ${referrer.id} ${cents}c for ${referredId}`);
    return { cents };
  } catch (e) {
    await admin.from("referrals").update({ status: "joined", rewarded_at: null, reward_cents: null }).eq("referred_id", referredId);
    throw e;
  }
}

// The referrer's referrals still open (at most 10 a call), each settled if its friend's refund window has passed. Never throws.
export async function settleReferrals(referrerId) {
  try {
    const { data: rows } = await createAdminClient().from("referrals").select("referred_id").eq("referrer_id", referrerId).eq("status", "joined").limit(10);
    for (const r of rows || []) await rewardReferral(r.referred_id).catch((e) => console.error("[referrals] settle:", e?.message || e));
  } catch (e) {
    console.error("[referrals] settle:", e?.message || e);
  }
}

// What the account page shows: friends who joined through the link, friends who subscribed, credit earned, and the credit
// still waiting on the member's Stripe balance (a negative balance is credit).
export async function referralSummary(userId, customerId) {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("referrals").select("status, reward_cents").eq("referrer_id", userId);
  const list = rows || [];
  let waitingCents = 0;
  if (customerId) {
    const c = await stripe.customers.retrieve(customerId).catch(() => null);
    if (c && !c.deleted && c.balance < 0) waitingCents = -c.balance;
  }
  return {
    joined: list.length,
    subscribed: list.filter((r) => r.status === "rewarded" && r.reward_cents > 0).length,
    earnedCents: list.reduce((n, r) => n + (r.reward_cents || 0), 0),
    waitingCents,
  };
}

// Is this a real member's code? (For the "a friend invited you" banner, so a made-up ?ref= shows nothing.)
export async function isLiveReferralCode(code) {
  if (!isReferralCode(code)) return false;
  return Boolean(await referrerByCode(createAdminClient(), code).catch(() => null));
}

// A share link with the member's referral code on it (?ref=CODE), so anyone who signs up from a member's share counts as their referral.
// Signed out, or the code can't be made: the link as it is. Never throws.
export async function withReferral(url, userId) {
  if (!userId) return url;
  const code = await ensureReferralCode(userId).catch(() => null);
  if (!code) return url;
  const u = new URL(url);
  u.searchParams.set("ref", code);
  return u.toString();
}
