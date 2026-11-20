import "server-only"; // holds a secret key: the build fails if a browser component ever imports this
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripeClient";
import { skyPlanGrant, stackBonus } from "@/lib/subscriptionTier";

// Night Sky plan time, granted the moment a member claims the rung (founder, Nov 19 2026: automate the week and the month; the Discord
// role and the newsletter shout-out stay by hand). The rules are skyPlanGrant / stackBonus in lib/subscriptionTier.js. A bonus tier is
// written on the profile (migration 0048, read by lib/tier.js); account credit goes on the member's Stripe balance, like the referral
// reward, with an idempotency key per member, season and rung so a retry can never pay twice. Returns { gave: a sentence for the ladder
// row, manual: true when the founder still has to act (the consult) }.
const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const LABEL = { explorer: "Explorer", singularity: "Singularity" };

export async function grantPlanTime(userId, kind, season) {
  const admin = createAdminClient();
  const { data: p, error } = await admin.from("profiles").select("email, tier, stripe_customer_id, bonus_tier, bonus_until").eq("id", userId).maybeSingle();
  if (error || !p) throw new Error(error?.message || "no profile");
  const paid = p.tier || "stargazer";
  const grant = skyPlanGrant(kind, paid, paid !== "stargazer");
  if (!grant) throw new Error(`unknown plan reward ${kind}`);

  // a Singularity member's week: a 1-on-1 consult, booked by the founder (the claim stays open in /admin until marked done)
  if (grant.manual === "consult") return { gave: "1-on-1 consult: we'll email you", manual: true };

  if (grant.bonus) {
    const next = stackBonus(p, grant);
    const { error: e } = await admin.from("profiles").update(next).eq("id", userId);
    if (e) throw e;
    console.log(`[night-sky] plan time: ${userId} ${grant.bonus} until ${next.bonus_until}`);
    return { gave: `${LABEL[grant.bonus]} until ${day(next.bonus_until)}` };
  }

  let customer = p.stripe_customer_id;
  if (!customer) {
    const c = await stripe.customers.create({ email: p.email, metadata: { user_id: userId } }, { idempotencyKey: `sd-customer-${userId}` });
    customer = c.id;
    await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", userId).is("stripe_customer_id", null);
  }
  await stripe.customers.createBalanceTransaction(
    customer,
    { amount: -grant.credit, currency: "usd", description: `Night Sky reward: ${kind === "week" ? "a week" : "a month"} of your plan`, metadata: { user_id: userId, season: String(season) } },
    { idempotencyKey: `sd-sky-${kind}-${season}-${userId}` }
  );
  console.log(`[night-sky] plan time: ${userId} ${grant.credit}c credit`);
  return { gave: `$${(grant.credit / 100).toFixed(2)} off your next bill` };
}
