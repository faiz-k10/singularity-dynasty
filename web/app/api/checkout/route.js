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

  // If the shopper is signed in, thread their user id through Checkout so
  // the webhook can match the subscription back to the right profile
  // without relying on email matching.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      ...(user ? { client_reference_id: user.id, customer_email: user.email } : {}),
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
