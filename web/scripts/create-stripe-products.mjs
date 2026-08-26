// One-off setup script: creates the Explorer and Singularity Stripe
// Products + monthly/annual Prices in test mode.
//
// Usage:
//   node --env-file=.env.local scripts/create-stripe-products.mjs
//
// Safe to re-run — it looks for existing products by name first and
// skips creating duplicates.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = [
  {
    name: "Explorer",
    description: "Full rankings, full draft tools, no ceiling on teams.",
    monthly: 900, // $9.00
    annual: 8400, // $7/mo billed annually ($84/yr)
  },
  {
    name: "Singularity",
    description: "The endpoint. Everything converges here.",
    monthly: 2500, // $25.00
    annual: 24000, // $20/mo billed annually ($240/yr)
  },
];

async function findExistingProduct(name) {
  const products = await stripe.products.list({ limit: 100 });
  return products.data.find((p) => p.name === name);
}

async function main() {
  const result = {};

  for (const plan of PLANS) {
    let product = await findExistingProduct(plan.name);
    if (product) {
      console.log(`Product "${plan.name}" already exists (${product.id}), reusing it.`);
    } else {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
      });
      console.log(`Created product "${plan.name}" (${product.id})`);
    }

    const existingPrices = await stripe.prices.list({
      product: product.id,
      limit: 100,
    });

    let monthlyPrice = existingPrices.data.find(
      (p) => p.recurring?.interval === "month" && p.unit_amount === plan.monthly
    );
    if (!monthlyPrice) {
      monthlyPrice = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: plan.monthly,
        recurring: { interval: "month" },
      });
      console.log(`  Created monthly price ${monthlyPrice.id} ($${plan.monthly / 100}/mo)`);
    } else {
      console.log(`  Reusing monthly price ${monthlyPrice.id}`);
    }

    let annualPrice = existingPrices.data.find(
      (p) => p.recurring?.interval === "year" && p.unit_amount === plan.annual
    );
    if (!annualPrice) {
      annualPrice = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: plan.annual,
        recurring: { interval: "year" },
      });
      console.log(`  Created annual price ${annualPrice.id} ($${plan.annual / 100}/yr)`);
    } else {
      console.log(`  Reusing annual price ${annualPrice.id}`);
    }

    result[plan.name.toUpperCase()] = {
      monthly: monthlyPrice.id,
      annual: annualPrice.id,
    };
  }

  console.log("\nAdd these to web/.env.local:\n");
  console.log(`STRIPE_PRICE_EXPLORER_MONTHLY=${result.EXPLORER.monthly}`);
  console.log(`STRIPE_PRICE_EXPLORER_ANNUAL=${result.EXPLORER.annual}`);
  console.log(`STRIPE_PRICE_SINGULARITY_MONTHLY=${result.SINGULARITY.monthly}`);
  console.log(`STRIPE_PRICE_SINGULARITY_ANNUAL=${result.SINGULARITY.annual}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
