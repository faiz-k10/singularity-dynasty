import { createClient } from "@/lib/supabase/server";

// How many teams each tier can save in /my-team. null = unlimited.
// Mirrored by the DB trigger in 0024_saved_teams_tier_limit.sql -- keep
// the two in sync. Stargazer 1, Explorer/Singularity unlimited, matching
// the pricing copy ("no ceiling on teams" for Explorer).
export const SAVED_TEAM_LIMITS = {
  stargazer: 1,
  explorer: null,
  singularity: null,
};

// Returns the cap for a tier, or null for unlimited. Must use an `in`
// check, not `?? stargazer` -- `null` is a real value in the map
// (unlimited) and `??` would wrongly replace it with the stargazer cap.
export function savedTeamLimit(tier) {
  return tier in SAVED_TEAM_LIMITS ? SAVED_TEAM_LIMITS[tier] : SAVED_TEAM_LIMITS.stargazer;
}

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
