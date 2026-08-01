// One-off setup script: creates a default Stripe Customer Portal
// configuration (payment method updates, invoice history, cancellation)
// so app/account/actions.js's openBillingPortal() has something to open.
//
// Usage:
//   node --env-file=.env.local scripts/setup-billing-portal.mjs
//
// Safe to re-run — skips creation if an active configuration already exists.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function main() {
  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  const active = existing.data.find((c) => c.is_default || c.active);

  if (active) {
    console.log(`Billing portal configuration already exists (${active.id}). Nothing to do.`);
    return;
  }

  const config = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "Singularity Dynasty subscription management",
    },
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["email"],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
      },
    },
  });

  console.log(`Created billing portal configuration: ${config.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
