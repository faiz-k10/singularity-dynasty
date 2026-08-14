import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// A plain, cookie-free anon-key client for data that's readable by
// everyone regardless of who's asking (e.g. published rankings/stat
// tables gated only by row-count, not RLS identity). Safe to call from
// inside a Next.js `unstable_cache`/`use cache` scope, unlike the
// cookie-bound server client (lib/supabase/server.js) -- Next.js
// explicitly disallows touching cookies/headers inside a cache scope,
// since a cached function's result can't legitimately vary per request.
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
