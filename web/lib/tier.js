import { createClient } from "@/lib/supabase/server";

// Shared by every /tools/* page: returns the signed-in user's tier
// ('stargazer' if signed out or no profile row) plus the already-created
// Supabase client so pages don't need to instantiate it twice.
export async function getUserTier() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, tier: "stargazer" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single();

  return { supabase, user, tier: profile?.tier || "stargazer" };
}
