import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "../../login/actions";
import AuthCard from "../../login/AuthCard";

export const metadata = {
  title: "Set Password — Dynasty Singularity",
};

// Set a new password: reached from the account page, or from the reset email (which /auth/confirm has already signed in).
export default async function PasswordPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login/reset?error=reset-needs-session");

  return (
    <AuthCard title="Set a new password." sub={user.email} error={params?.error}>
      <form className="auth-form">
        <label className="feed-label mono" htmlFor="password">
          NEW PASSWORD
        </label>
        <input id="password" name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className="feed-input auth-input" />
        <label className="feed-label mono" htmlFor="confirm">
          CONFIRM PASSWORD
        </label>
        <input id="confirm" name="confirm" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className="feed-input auth-input" />
        <div className="auth-actions">
          <button formAction={updatePassword} className="btn-primary">
            Save Password
          </button>
          <Link href="/account" className="btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
