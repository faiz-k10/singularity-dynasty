"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe, cancelAllNow } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/siteOrigin";

export async function openBillingPortal() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Faccount");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    redirect("/account?notice=no-billing");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${await siteOrigin()}/account`,
  });

  redirect(session.url);
}

// Deletes the signed-in account for good (the privacy page promises it): any running subscription is cancelled at once (no
// further charges), the Stripe customer is removed (saved cards with it; Stripe keeps the invoices it must by law), then the
// login itself -- which deletes the profile, saved leagues, insights and history with it (foreign keys, on delete cascade)
// and detaches paywall telemetry (on delete set null). The visitor must type DELETE; checked here, not only in the form.
export async function deleteAccount(formData) {
  if (String(formData.get("confirm") || "") !== "DELETE") redirect("/account?notice=delete-confirm");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  const customer = profile?.stripe_customer_id;
  if (customer) {
    try {
      await cancelAllNow(customer);
    } catch (e) {
      console.error("[account] cancel before delete failed:", e.message);
      redirect("/account?notice=delete-failed");
    }
    await stripe.customers.del(customer).catch((e) => console.error("[account] customer delete:", e.message));
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account] deleteUser:", error.message);
    redirect("/account?notice=delete-failed");
  }
  await supabase.auth.signOut().catch(() => {});
  redirect("/login?message=account-deleted");
}
