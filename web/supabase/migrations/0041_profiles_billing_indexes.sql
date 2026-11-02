-- Billing lookups on profiles (Nov 1 2026). The Stripe webhook / checkout return (lib/billing.js) find a profile by its
-- subscription id, the checkout route by customer, and pre-sign-in checkouts by email; none of these columns had an index,
-- so each lookup scanned the whole table. The subscription id is also made UNIQUE: one paid subscription can never be
-- attached to two accounts.
-- Run once in the Supabase SQL editor.

create unique index if not exists profiles_stripe_subscription_id_key
  on public.profiles (stripe_subscription_id) where stripe_subscription_id is not null;

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

create index if not exists profiles_email_idx on public.profiles (email);
