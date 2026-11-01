import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
  explorer: {
    monthly: process.env.STRIPE_PRICE_EXPLORER_MONTHLY,
    annual: process.env.STRIPE_PRICE_EXPLORER_ANNUAL,
  },
  singularity: {
    monthly: process.env.STRIPE_PRICE_SINGULARITY_MONTHLY,
    annual: process.env.STRIPE_PRICE_SINGULARITY_ANNUAL,
  },
};

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { plan, billing } = body || {};
  const priceId = PRICE_IDS[plan]?.[billing];

  if (!priceId) {
    return NextResponse.json(
      { error: `Unknown plan/billing combination: ${plan}/${billing}` },
      { status: 400 }
    );
  }

  const origin = request.headers.get("origin") || new URL(request.url).origin;

  // Checkout needs an account: the user id goes through Checkout so the webhook can match the subscription to the right profile.
  // Without one, a buyer whose Stripe email matched no profile (or who signed up after paying) was charged and never upgraded.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to subscribe.", login: "/login?next=%2F%23pricing" }, { status: 401 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      client_reference_id: user.id,
      customer_email: user.email,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 }
    );
  }
}
