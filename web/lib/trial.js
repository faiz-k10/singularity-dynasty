import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRIAL_DAYS, TRIAL_TIER } from "@/lib/tierLimits";

// Starts a brand-new account's Explorer trial (lib/tierLimits.js). Only an account with no bonus yet, so it can't be restarted; never throws
// (a failed write just means no trial, and sign-up carries on).
export async function startTrial(userId, now = Date.now()) {
  try {
    const until = new Date(now + TRIAL_DAYS * 86_400_000).toISOString();
    const { error } = await createAdminClient().from("profiles").update({ bonus_tier: TRIAL_TIER, bonus_until: until }).eq("id", userId).is("bonus_tier", null);
    if (error) console.error("[trial] could not start:", error.message);
  } catch (e) {
    console.error("[trial] could not start:", e?.message || e);
  }
}
