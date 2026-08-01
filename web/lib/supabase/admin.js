import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service_role key — bypasses Row Level
// Security. Only ever import this from trusted server code (route
// handlers), never from anything that ships to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
