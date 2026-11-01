// Sets up the Stripe Customer Portal (what "Manage Billing" opens): payment method updates, invoice history, cancellation at
// the end of the period, and SWITCHING PLANS between Explorer and Singularity (monthly / annual, prorated). Plan switching
// matters because checkout sends anyone who already has a subscription here instead of starting a second one
// (app/api/checkout/route.js).
//
// Usage (test or live, whichever key it is given; scripts/stripe-go-live.mjs runs it for live):
//   node --env-file=.env.local scripts/setup-billing-portal.mjs
//
// Safe to re-run: it updates the existing default configuration in place, or creates one if there is none.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_ENV = ["STRIPE_PRICE_EXPLORER_MONTHLY", "STRIPE_PRICE_EXPLORER_ANNUAL", "STRIPE_PRICE_SINGULARITY_MONTHLY", "STRIPE_PRICE_SINGULARITY_ANNUAL"];

async function main() {
  const missing = PRICE_ENV.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} -- run create-stripe-products.mjs and set them first.`);

  // The portal lists switchable plans per product: { product, prices: [...] }.
  const byProduct = new Map();
  for (const k of PRICE_ENV) {
    const price = await stripe.prices.retrieve(process.env[k]);
    const product = typeof price.product === "string" ? price.product : price.product.id;
    byProduct.set(product, [...(byProduct.get(product) || []), price.id]);
  }

  const settings = {
    business_profile: { headline: "Singularity Dynasty subscription management" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: [...byProduct].map(([product, prices]) => ({ product, prices })),
      },
    },
  };

  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  const current = existing.data.find((c) => c.is_default) || existing.data.find((c) => c.active);
  if (current) {
    await stripe.billingPortal.configurations.update(current.id, settings);
    console.log(`Updated billing portal configuration ${current.id} (plan switching on, ${byProduct.size} products).`);
  } else {
    const config = await stripe.billingPortal.configurations.create(settings);
    console.log(`Created billing portal configuration: ${config.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
