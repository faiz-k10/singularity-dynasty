import { test } from "node:test";
import assert from "node:assert/strict";
import { subscriptionTier } from "../lib/subscriptionTier.js";

const PRICES = { p_exp_m: "explorer", p_exp_y: "explorer", p_sing_m: "singularity", p_sing_y: "singularity" };
const sub = (status, ...prices) => ({ status, items: { data: prices.map((id) => ({ price: { id } })) } });

test("subscriptionTier: paid-up statuses grant the plan", () => {
  assert.equal(subscriptionTier(sub("active", "p_exp_m"), PRICES), "explorer");
  assert.equal(subscriptionTier(sub("trialing", "p_sing_y"), PRICES), "singularity");
  assert.equal(subscriptionTier(sub("past_due", "p_exp_y"), PRICES), "explorer", "access holds while Stripe retries the card");
});

test("subscriptionTier: a subscription that isn't being paid grants nothing", () => {
  for (const s of ["incomplete", "incomplete_expired", "unpaid", "canceled", "paused"]) {
    assert.equal(subscriptionTier(sub(s, "p_sing_m"), PRICES), "stargazer", s);
  }
});

test("subscriptionTier: unknown prices, missing data and the highest of several items", () => {
  assert.equal(subscriptionTier(sub("active", "price_someone_else"), PRICES), "stargazer");
  assert.equal(subscriptionTier(null, PRICES), "stargazer");
  assert.equal(subscriptionTier({ status: "active" }, PRICES), "stargazer");
  assert.equal(subscriptionTier(sub("active", "p_exp_m", "p_sing_m"), PRICES), "singularity");
  assert.equal(subscriptionTier(sub("active", "p_exp_m"), {}), "stargazer");
});

test("monthlyCents: monthly and annual prices to a monthly figure; unpaid statuses count 0", async () => {
  const { monthlyCents } = await import("../lib/subscriptionTier.js");
  const s = (status, unit_amount, interval) => ({ status, items: { data: [{ quantity: 1, price: { unit_amount, recurring: { interval, interval_count: 1 } } }] } });
  assert.equal(monthlyCents(s("active", 900, "month")), 900);
  assert.equal(monthlyCents(s("active", 8400, "year")), 700);
  assert.equal(monthlyCents(s("trialing", 24000, "year")), 2000);
  assert.equal(monthlyCents(s("past_due", 900, "month")), 0);
  assert.equal(monthlyCents(null), 0);
});
