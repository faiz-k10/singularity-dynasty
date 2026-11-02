import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Who may open /admin: accounts whose CONFIRMED email is in ADMIN_EMAILS (Vercel env var, comma-separated), defaulting to the
// founder's address. Everyone else -- signed out, unconfirmed, any other account -- gets a plain 404, so the page's existence
// isn't advertised. Checked with getUser() (asks Supabase, so a revoked session is refused at once) on the page AND in every
// admin action.
const ADMINS = (process.env.ADMIN_EMAILS || "eremruh11@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !user.email_confirmed_at || !ADMINS.includes(user.email.toLowerCase())) notFound();
  return user;
}
