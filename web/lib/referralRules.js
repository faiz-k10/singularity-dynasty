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
