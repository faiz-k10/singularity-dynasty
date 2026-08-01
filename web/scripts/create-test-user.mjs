// One-off local verification script: creates a confirmed test user via the
// Supabase Admin API (bypasses the email-send rate limit) and checks that
// the profiles-table auto-create trigger fired correctly.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data, error } = await supabase.auth.admin.createUser({
  email: "admin-test-user@mailinator.com",
  password: "testpassword123",
  email_confirm: true,
});

if (error) {
  console.error("ERROR:", error.message);
  process.exit(1);
}

console.log("Created user:", data.user.id, data.user.email);

const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("*")
  .eq("id", data.user.id)
  .single();

if (profileError) {
  console.error("PROFILE ERROR:", profileError.message);
  process.exit(1);
}

console.log("Auto-created profile:", JSON.stringify(profile, null, 2));
