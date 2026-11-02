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
