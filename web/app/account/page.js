import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier, email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  const tier = profile?.tier || "stargazer";

  return (
    <div className="auth-page">
      <SiteHeader />
      <div className="wrap auth-wrap">
        <div className="auth-card reveal in">
          <div className="eyebrow blue">Account</div>
          <h1>Welcome back.</h1>
          <p className="auth-sub">{profile?.email || user.email}</p>

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
