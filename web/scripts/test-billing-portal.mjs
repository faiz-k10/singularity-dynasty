// One-off local verification: attaches a real Stripe test customer to the
// admin-test-user profile, then creates a billing portal session for it,
// proving the portal configuration + Stripe API call actually work end to
// end (not just that the code compiles).
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: profile, error } = await supabase
  .from("profiles")
  .select("id, email, stripe_customer_id")
  .eq("email", "admin-test-user@mailinator.com")
  .single();

if (error) {
  console.error("Could not find test user profile:", error.message);
  process.exit(1);
}

// Always mint a fresh real customer — a prior test in this session left a
// fake placeholder id (cus_test_prod_fake) on this profile that doesn't
// actually exist in Stripe.
const customer = await stripe.customers.create({ email: profile.email });
const customerId = customer.id;
console.log("Created real Stripe test customer:", customerId);

await supabase
  .from("profiles")
  .update({ tier: "explorer", stripe_customer_id: customerId })
  .eq("id", profile.id);
console.log("Attached to profile and set tier to explorer.");

const session = await stripe.billingPortal.sessions.create({
  customer: customerId,
  return_url: "http://localhost:3000/account",
});

console.log("Billing portal session created successfully:");
console.log(session.url);
