import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// A plain, cookie-free anon-key client for data that's readable by
// everyone regardless of who's asking (e.g. published rankings/stat
// tables gated only by row-count, not RLS identity). Safe to call from
// inside a Next.js `unstable_cache`/`use cache` scope, unlike the
// cookie-bound server client (lib/supabase/server.js) -- Next.js
// explicitly disallows touching cookies/headers inside a cache scope,
// since a cached function's result can't legitimately vary per request.
//
// SERVER ONLY (Nov 9 2026 security pass): it reads with the service-role key when the server has one, so the published model
// tables (weekly rankings, season simulations, draft board, role / usage groups) need no "anyone can read" policy -- migration
// 0044 removes those, after which nobody can download the paid tables with the public key, only through our tier-gated pages.
// The key is not a NEXT_PUBLIC_ variable, so it is never bundled for the browser; this throws if it is ever called there.
// Only reads published, non-personal data: never use it for a user's own rows (use lib/supabase/server.js, which RLS scopes).
export function createPublicClient() {
  if (typeof window !== "undefined") throw new Error("createPublicClient is server-only");
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
