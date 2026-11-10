import Link from "next/link";
import { requestPasswordReset } from "../actions";
import AuthCard from "../AuthCard";

export const metadata = {
  title: "Reset Password — Dynasty Singularity",
};

export default async function ResetPage({ searchParams }) {
  const params = await searchParams;
  return (
    <AuthCard title="Reset your password." sub="Enter your account's email and we'll send you a link to set a new password." error={params?.error}>
      <form className="auth-form">
        <label className="feed-label mono" htmlFor="email">
          EMAIL
        </label>
        <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" className="feed-input auth-input" placeholder="you@domain.com" />
        <div className="auth-actions">
          <button formAction={requestPasswordReset} className="btn-primary">
            Send Reset Link
          </button>
          <Link href="/login" className="btn-ghost">
            Back to Sign In
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
