// Which tier a Stripe subscription earns -- the ONE rule the webhook and the checkout return page both use (lib/billing.js).
// Pure (no Stripe / Supabase imports) so it is unit-tested (test/subscriptionTier.test.mjs).
//
// A subscription grants its plan only while Stripe still expects it to be paid:
//   active, trialing   paid up
//   past_due           a renewal failed and Stripe is retrying (Smart Retries / dunning) -- access stays during the retries,
//                      and Stripe moves it to unpaid or canceled if they all fail
// Everything else -- incomplete (first payment never went through), incomplete_expired, unpaid, canceled, paused -- is the
// free tier. Before this, the webhook set the paid tier on ANY subscription.updated, whatever the status.
export const ACCESS_STATUSES = new Set(["active", "trialing", "past_due"]);

const RANK = { stargazer: 0, explorer: 1, singularity: 2 };

// sub: a Stripe subscription object (or null). tierByPrice: { priceId: "explorer" | "singularity" }.
// Returns "stargazer" | "explorer" | "singularity"; an unknown price grants nothing.
export function subscriptionTier(sub, tierByPrice) {
  if (!sub || !ACCESS_STATUSES.has(sub.status)) return "stargazer";
  let best = "stargazer";
  for (const item of sub.items?.data || []) {
    const t = tierByPrice?.[item?.price?.id];
    if (t && RANK[t] > RANK[best]) best = t;
  }
  return best;
}

// What a subscription brings in per month, in cents (annual prices / 12), for the /admin revenue figure. Only paid-up
// statuses count (a past_due renewal hasn't been collected yet, so it is left out here even though access continues).
export function monthlyCents(sub) {
  if (!sub || !["active", "trialing"].includes(sub.status)) return 0;
  let total = 0;
  for (const item of sub.items?.data || []) {
    const p = item?.price;
    const amount = (p?.unit_amount ?? 0) * (item.quantity ?? 1);
    const every = p?.recurring?.interval_count || 1;
    const perMonth = p?.recurring?.interval === "year" ? amount / (12 * every) : p?.recurring?.interval === "week" ? (amount * 52) / (12 * every) : amount / every;
    total += perMonth;
  }
  return Math.round(total);
}

// The tier a member actually has: their paid tier, or a Night Sky plan-time bonus while it lasts (whichever is higher).
export function effectiveTier(tier, bonusTier, bonusUntil, now = Date.now()) {
  const paid = RANK[tier] != null ? tier : "stargazer";
  if (!bonusTier || RANK[bonusTier] == null || !(Date.parse(bonusUntil) > now)) return paid;
  return RANK[bonusTier] > RANK[paid] ? bonusTier : paid;
}

// What a Night Sky plan-time rung gives (founder, Nov 19 2026: automated). kind "week" = a week of the next plan up; "month" = a free month
// of your plan. `paid` = the member's PAID tier (profiles.tier), `subscribed` = they have a running subscription. Returns
// { bonus: tier, days } (a time-limited tier, no Stripe) or { credit: cents } (Stripe account credit off their next bill).
//   week:  Stargazer -> 7 days of Explorer; Explorer -> 7 days of Singularity; Singularity (no plan above) -> a 1-on-1 consult with the
//          founder (founder, Nov 19 2026; { manual: "consult" }, fulfilled by hand from /admin)
//   month: a subscriber -> a month of their plan as credit (the monthly list price); anyone else -> 30 days of Explorer
export const PLAN_MONTH_CENTS = { explorer: 1200, singularity: 3000 }; // one month at the monthly price (Nov 22 2026)
export function skyPlanGrant(kind, paid, subscribed) {
  if (kind === "week") {
    if (paid === "singularity") return { manual: "consult" };
    return { bonus: paid === "explorer" ? "singularity" : "explorer", days: 7 };
  }
  if (kind === "month") {
    if (subscribed && PLAN_MONTH_CENTS[paid]) return { credit: PLAN_MONTH_CENTS[paid] };
    return { bonus: "explorer", days: 30 };
  }
  return null;
}
// A new bonus on top of one already running: the same tier extends it, otherwise the new one starts now.
export function stackBonus(current, grant, now = Date.now()) {
  const live = current?.bonus_tier && Date.parse(current.bonus_until) > now;
  const from = live && current.bonus_tier === grant.bonus ? Date.parse(current.bonus_until) : now;
  return { bonus_tier: grant.bonus, bonus_until: new Date(from + grant.days * 86_400_000).toISOString() };
}
