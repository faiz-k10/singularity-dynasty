import Stripe from "stripe";

// The one Stripe client for the server (secret key; never import from browser code). lib/billing.js and lib/referrals.js
// share it.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
