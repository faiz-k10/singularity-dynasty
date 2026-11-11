import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { provisionFromCheckout, accountBilling } from "@/lib/billing";
import { signout } from "../login/actions";
import { openBillingPortal, deleteAccount } from "./actions";
import EmailDigestToggle from "../my-team/EmailDigestToggle";
import ReferralCard from "./ReferralCard";
import { ensureReferralCode, referralSummary, settleReferrals } from "@/lib/referrals";
import { FRIEND_DISCOUNT_PERCENT, rewardFor } from "@/lib/referralRules";
import { siteOrigin } from "@/lib/siteOrigin";
import SiteHeader from "../SiteHeader";
import { money } from "@/lib/format";

export const metadata = {
  title: "Your Account — Dynasty Singularity",
  robots: { index: false, follow: false },
};

const TIER_LABELS = {
  stargazer: "Stargazer",
  explorer: "Explorer",
  singularity: "Singularity",
};
const TIER_LINES = {
  stargazer: "Free: 1 saved league, the top 50 weekly rankings and the top 10 season simulations.",
  explorer: "Up to 10 leagues watched live, every player ranked, the full dynasty board and the weekly email.",
  singularity: "Everything: unlimited leagues, every season simulation and priority Discord.",
};

// Fixed notices only (never text from the URL), keyed by ?notice=.
const NOTICES = {
  "password-updated": ["ok", "Your password has been updated."],
  confirmed: ["ok", "Your email is confirmed. Welcome aboard."],
  "no-billing": ["ok", "There's no subscription on this account yet."],
  "delete-confirm": ["bad", "To delete your account, type DELETE (in capitals) in the box."],
  "delete-failed": ["bad", "We couldn't delete your account just now, and nothing was changed. Please try again, or contact us."],
};

const day = (ms) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");

function Billing({ billing, hasCustomer }) {
  if (billing?.error) return <p className="acct-line">We couldn&apos;t reach the billing system just now. Manage Billing still works.</p>;
  if (!billing) {
    return hasCustomer ? <p className="acct-line">No active subscription. Your invoices are in Manage Billing.</p> : null;
  }
  const per = billing.interval === "year" ? "year" : "month";
  return (
    <dl className="acct-facts">
      <div>
        <dt className="mono">Billing</dt>
        <dd>
          {money(billing.priceCents)} a {per}
        </dd>
      </div>
      {billing.status === "past_due" || billing.status === "unpaid" ? (
        <div className="is-bad">
          <dt className="mono">Payment</dt>
          <dd>Your last payment didn&apos;t go through. Update your card in Manage Billing to keep your plan.</dd>
        </div>
      ) : billing.cancelAtPeriodEnd ? (
        <div>
          <dt className="mono">Ends</dt>
          <dd>{day(billing.periodEnd)}. You keep everything until then, and you won&apos;t be charged again.</dd>
        </div>
      ) : (
        <div>
          <dt className="mono">Next charge</dt>
          <dd>
            {billing.next ? `${money(billing.next.cents)} on ${day(billing.next.at)}` : `Renews ${day(billing.periodEnd)}`}
          </dd>
        </div>
      )}
      {billing.card && (
        <div>
          <dt className="mono">Card</dt>
          <dd>
            {billing.card.brand[0].toUpperCase() + billing.card.brand.slice(1)} ending {billing.card.last4}
          </dd>
        </div>
      )}
    </dl>
  );
}

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

  const { data: profile } = await supabase.from("profiles").select("tier, email, stripe_customer_id, email_digest").eq("id", user.id).single();
  const tier = profile?.tier || "stargazer";
  const [billing, refCode, refSummary, origin] = await Promise.all([
    profile?.stripe_customer_id ? accountBilling(profile.stripe_customer_id) : null,
    ensureReferralCode(user.id).catch(() => null),
    settleReferrals(user.id).then(() => referralSummary(user.id, profile?.stripe_customer_id)).catch(() => null),
    siteOrigin(),
  ]);
  const notice = NOTICES[params?.notice] || null;
  const joined = user.created_at ? day(Date.parse(user.created_at)) : "";

  return (
    <div className="auth-page">
      <SiteHeader />
      <main id="main-content" className="wrap auth-wrap acct">
        <div className="auth-card reveal in">
          <div className="eyebrow blue">Account</div>
          <h1>Your account.</h1>
          <p className="auth-sub">
            {profile?.email || user.email}
            {joined && <span className="acct-dim"> · member since {joined}</span>}
          </p>

          {params?.checkout === "success" &&
            (tier !== "stargazer" ? (
              <p className="auth-notice mono" role="status">Payment received. Welcome to {TIER_LABELS[tier]}: everything in it is unlocked now.</p>
            ) : (
              <p className="auth-notice mono" role="status">
                {purchase?.status === "incomplete"
                  ? "Your payment hasn't gone through yet. If your bank asked you to confirm it, finish that step; your plan unlocks as soon as it clears."
                  : "Payment received. We're finishing your upgrade: refresh this page in a minute."}
              </p>
            ))}
          {notice && (
            <p className={`${notice[0] === "bad" ? "auth-error" : "auth-notice"} mono`} role={notice[0] === "bad" ? "alert" : "status"}>
              {notice[1]}
            </p>
          )}

          <section className="acct-section" aria-labelledby="acct-plan">
            <h2 id="acct-plan" className="acct-h mono">Plan</h2>
            <div className="account-tier">
              <div className="account-tier-name">{TIER_LABELS[tier]}</div>
              <p className="acct-line">{TIER_LINES[tier]}</p>
            </div>
            <Billing billing={billing} hasCustomer={Boolean(profile?.stripe_customer_id)} />
            <div className="auth-actions">
              {profile?.stripe_customer_id ? (
                <form>
                  <button formAction={openBillingPortal} className="btn-primary">
                    Manage Billing
                  </button>
                </form>
              ) : null}
              {tier !== "singularity" && (
                <Link href="/#pricing" className={profile?.stripe_customer_id ? "btn-ghost" : "btn-primary"}>
                  {tier === "stargazer" ? "See Plans" : "Compare Plans"}
                </Link>
              )}
            </div>
            {profile?.stripe_customer_id && <p className="acct-small">Change plan, update your card, download invoices or cancel in Manage Billing. Cancelling keeps your plan until the end of the period you paid for.</p>}
          </section>

          {refCode && (
            <section className="acct-section" aria-labelledby="acct-refer">
              <h2 id="acct-refer" className="acct-h mono">Refer a friend</h2>
              <ReferralCard
                link={`${origin}/?ref=${refCode}`}
                discountPct={FRIEND_DISCOUNT_PERCENT}
                rewardLabel={`a free month of ${tier === "singularity" ? "Singularity" : "Explorer"} ($${rewardFor(tier) / 100})`}
                summary={refSummary}
              />
            </section>
          )}

          <section className="acct-section" aria-labelledby="acct-email">
            <h2 id="acct-email" className="acct-h mono">Email</h2>
            <EmailDigestToggle tier={tier} enabled={profile?.email_digest} />
            <p className="acct-small">The weekly email covers the players on your saved leagues: what moved, who&apos;s out, and this week&apos;s outlook. Account emails (sign-in links, receipts) are always sent.</p>
          </section>

          <section className="acct-section" aria-labelledby="acct-security">
            <h2 id="acct-security" className="acct-h mono">Sign-in</h2>
            <div className="auth-actions">
              <Link href="/account/password" className="btn-ghost">
                Change Password
              </Link>
              <form>
                <button formAction={signout} className="btn-ghost">
                  Sign Out
                </button>
              </form>
            </div>
          </section>

          <section className="acct-section acct-danger" aria-labelledby="acct-delete">
            <h2 id="acct-delete" className="acct-h mono">Delete account</h2>
            <details>
              <summary>Permanently delete this account</summary>
              <p className="acct-small">
                This deletes your login, saved leagues and settings for good. {billing && !billing.error ? "Your subscription is cancelled immediately and you won't be charged again (unused time isn't refunded automatically; within 14 days of a payment, contact us for a refund). " : ""}
                It can&apos;t be undone.
              </p>
              <form action={deleteAccount} className="acct-delete-form">
                <label className="feed-label mono" htmlFor="confirm-delete">
                  TYPE DELETE TO CONFIRM
                </label>
                <input id="confirm-delete" name="confirm" required pattern="DELETE" autoComplete="off" className="feed-input auth-input" />
                <button className="btn-ghost acct-delete-btn">Delete My Account</button>
              </form>
            </details>
          </section>
        </div>
      </main>
    </div>
  );
}
