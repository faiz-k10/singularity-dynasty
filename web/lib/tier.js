import { createClient } from "@/lib/supabase/server";

// Split out from getUserTier() below so a page that wants to run tier
// resolution concurrently with its own data queries (instead of blocking
// on it first) can call this directly against a client it already has,
// rather than pulling in a second one. See player-simulations/page.js.
export async function resolveTier(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, tier: "stargazer" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single();

  return { user, tier: profile?.tier || "stargazer" };
}

// Shared by every /tools/* page: returns the signed-in user's tier
// ('stargazer' if signed out or no profile row) plus the already-created
// Supabase client so pages don't need to instantiate it twice.
export async function getUserTier() {
  const supabase = await createClient();
  const { user, tier } = await resolveTier(supabase);
  return { supabase, user, tier };
}
