import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/authUser";
import { effectiveTier } from "./subscriptionTier";

// Pure tier-policy bits live in tierLimits.js (no imports -> unit-tested).
export { SAVED_TEAM_LIMITS, savedTeamLimit } from "./tierLimits";

// Split out from getUserTier() below so a page that wants to run tier
// resolution concurrently with its own data queries (instead of blocking
// on it first) can call this directly against a client it already has,
// rather than pulling in a second one. See player-simulations/page.js.
export async function resolveTier(supabase) {
  const user = await getAuthUser(supabase); // local JWT check, no round trip to Supabase Auth

  if (!user) {
    return { user: null, tier: "stargazer" };
  }

  return { user, tier: await tierOf(supabase, user.id) };
}

// The member's tier including a Night Sky plan-time bonus (migration 0048). If those columns aren't there yet the plain tier is
// read instead, so a missing migration can never drop paying members to the free tier.
export async function tierOf(supabase, userId) {
  let { data: profile, error } = await supabase.from("profiles").select("tier, bonus_tier, bonus_until").eq("id", userId).maybeSingle();
  if (error) ({ data: profile } = await supabase.from("profiles").select("tier").eq("id", userId).maybeSingle());
  return effectiveTier(profile?.tier || "stargazer", profile?.bonus_tier, profile?.bonus_until);
}

// Shared by every /tools/* page: returns the signed-in user's tier
// ('stargazer' if signed out or no profile row) plus the already-created
// Supabase client so pages don't need to instantiate it twice.
export async function getUserTier() {
  const supabase = await createClient();
  const { user, tier } = await resolveTier(supabase);
  return { supabase, user, tier };
}
