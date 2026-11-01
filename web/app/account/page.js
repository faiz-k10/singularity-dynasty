import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { provisionFromCheckout } from "@/lib/billing";
import { signout } from "../login/actions";
import { openBillingPortal } from "./actions";
import SiteHeader from "../SiteHeader";

export const metadata = {
  title: "Your Account — Singularity Dynasty",
};

const TIER_LABELS = {
  stargazer: "Stargazer",
  explorer: "Explorer",
  singularity: "Singularity",
};

// Fixed notices only (never text from the URL), keyed by ?notice=.
const NOTICES = {
  "password-updated": "Your password has been updated.",
  confirmed: "Your email is confirmed. You're signed in.",
  "no-billing": "There's no subscription on this account yet.",
};

export default async function AccountPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Faccount");
  }

  // Back from Stripe Checkout: settle the purchase now instead of waiting for the webhook (which can land a few seconds
  // after the buyer does). The session must belong to this account; anything else is ignored. Safe to repeat.
  let purchase = null;
  if (params?.checkout === "success" && typeof params.session_id === "string" && params.session_id.startsWith("cs_")) {
    purchase = await provisionFromCheckout(params.session_id, { expectedUserId: user.id }).catch((err) => {
      console.error("[account] checkout return:", err.message);
      return null;
    });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier, email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  const tier = profile?.tier || "stargazer";
  const notice = NOTICES[params?.notice] || null;

  return (
    <div className="auth-page">
      <SiteHeader />
      <div className="wrap auth-wrap">
        <div className="auth-card reveal in">
          <div className="eyebrow blue">Account</div>
          <h1>Welcome back.</h1>
          <p className="auth-sub">{profile?.email || user.email}</p>

          {params?.checkout === "success" &&
            (tier !== "stargazer" ? (
              <p className="auth-notice mono">Payment received. Welcome to {TIER_LABELS[tier]}: everything in it is unlocked now.</p>
            ) : (
              <p className="auth-notice mono">
                {purchase?.status === "incomplete"
                  ? "Your payment hasn't gone through yet. If your bank asked you to confirm it, finish that step; your plan unlocks as soon as it clears."
                  : "Payment received. We're finishing your upgrade: refresh this page in a minute."}
              </p>
            ))}
          {notice && <p className="auth-notice mono">{notice}</p>}

          <div className="account-tier">
            <span className="hub-tag">Current Tier</span>
            <div className="account-tier-name">{TIER_LABELS[tier]}</div>
          </div>

          <div className="auth-actions">
            {profile?.stripe_customer_id ? (
              <form>
                <button formAction={openBillingPortal} className="btn-primary">
                  Manage Billing
                </button>
              </form>
            ) : (
              <Link href="/#pricing" className="btn-primary">
                Upgrade Plan
              </Link>
            )}
            <Link href="/account/password" className="btn-ghost">
              Change Password
            </Link>
            <form>
              <button formAction={signout} className="btn-ghost">
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
