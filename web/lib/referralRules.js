// The referral program's rules, in one place (pure; tested in test/referralRules.test.mjs). lib/referrals.js applies them.
//
//   A member shares their link (any page + ?ref=CODE). A visitor who arrives through it is remembered for REF_DAYS (a
//   cookie set by proxy.js); when they create an account the referral is recorded, and when they first subscribe:
//     - the friend gets FRIEND_DISCOUNT_PERCENT off their first payment (a Stripe coupon, COUPON_ID, duration "once")
//     - the referrer gets one month of their own plan as Stripe account credit (REWARD_CENTS), applied to their next bill
//       automatically -- or waiting for them if they subscribe later. Credit, never cash; at most REWARD_CAP_PER_YEAR.
//   Only first-time subscribers count, and nobody can refer themselves.
export const REF_COOKIE = "sd_ref";
export const REF_DAYS = 30;
export const FRIEND_DISCOUNT_PERCENT = 20;
export const COUPON_ID = "sd-referral-20";
export const REWARD_CENTS = { explorer: 900, singularity: 2500 };
export const REWARD_CAP_PER_YEAR = 12;

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i: a code read aloud or typed can't be misread

// 8 characters from random bytes (crypto.getRandomValues / randomBytes in the caller).
export function makeCode(bytes) {
  return Array.from(bytes.slice(0, 8), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const isReferralCode = (v) => typeof v === "string" && /^[a-hj-km-np-z2-9]{8}$/.test(v);

// One free month of the referrer's plan; a free (Stargazer) referrer gets an Explorer month, waiting for when they subscribe.
export const rewardFor = (tier) => (tier === "singularity" ? REWARD_CENTS.singularity : REWARD_CENTS.explorer);

// May this referral give the friend their discount (and later pay the reward)? A different person, never subscribed before.
export function referralApplies({ referrerId, userId, subscribedBefore }) {
  return Boolean(referrerId) && referrerId !== userId && !subscribedBefore;
}

// The reward waits until the friend's first payment has stood for the refund window (founder's security check, Nov 9 2026):
// paid at once, a friend could subscribe through the link, ask for the 14-day refund and leave the referrer a free month, or
// one person could refer their own second email. Decision for one referral, from the friend's subscription and charges:
//   "wait" -- not yet: no payment, or the first payment is younger than REWARD_HOLD_DAYS
//   "pay"  -- first payment REWARD_HOLD_DAYS+ old, never refunded, the subscription still running, a different card
//   "void" -- will never pay: refunded, cancelled / expired, not the referred checkout, or paid with the referrer's own card
export const REWARD_HOLD_DAYS = 14;
const RUNNING = new Set(["active", "trialing", "past_due"]);
const ENDED = new Set(["canceled", "incomplete_expired", "unpaid", "paused"]);
export function rewardDecision({ now, referrerId, sub, charges, referrerCards }) {
  if (!sub) return "wait";
  if (sub.referrerId !== referrerId) return "void";
  if (ENDED.has(sub.status)) return "void";
  const paid = (charges || []).filter((c) => c.paid && c.status === "succeeded");
  if ((charges || []).some((c) => c.refunded || c.amountRefunded > 0)) return "void";
  if (paid.some((c) => c.fingerprint && referrerCards?.has(c.fingerprint))) return "void";
  if (!paid.length || !RUNNING.has(sub.status)) return "wait";
  const first = Math.min(...paid.map((c) => c.created));
  return now - first * 1000 >= REWARD_HOLD_DAYS * 86_400_000 ? "pay" : "wait";
}
