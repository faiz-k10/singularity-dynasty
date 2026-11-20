import "server-only"; // holds a secret key: the build fails if a browser component ever imports this
import Stripe from "stripe";

// The one Stripe client for the server (secret key; never import from browser code). lib/billing.js and lib/referrals.js
// share it.
if (typeof window !== "undefined") throw new Error("lib/stripeClient.js is server-only");
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
