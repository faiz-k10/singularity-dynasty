import Link from "next/link";
import { login, signup } from "./actions";
import BotGuard from "@/app/BotGuard";
import AuthCard from "./AuthCard";
import { safeNext } from "@/lib/authMessages";

export const metadata = {
  title: "Sign In — Dynasty Singularity",
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = safeNext(params?.next);

  return (
    <AuthCard
      title="Sign in to your orbit."
      sub="Track your tier, manage your subscription, and pick up where you left off."
      error={params?.error}
      message={params?.message}
    >
      <form className="auth-form">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="feed-label mono" htmlFor="email">
          EMAIL
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className="feed-input auth-input"
          placeholder="you@domain.com"
        />

        <label className="feed-label mono" htmlFor="password">
          PASSWORD
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          maxLength={200}
          autoComplete="current-password"
          className="feed-input auth-input"
          placeholder="••••••••"
        />

        <label className="auth-check mono">
          <input type="checkbox" name="newsletter" defaultChecked />
          New account: send me the Tuesday newsletter
        </label>
        <BotGuard action="login" />
        <div className="auth-actions">
          <button formAction={login} className="btn-primary">
            Sign In
          </button>
          <button formAction={signup} className="btn-ghost">
            Create Account
          </button>
        </div>
        <p className="auth-foot mono">
          New accounts get 14 days of Explorer free. No card needed.
        </p>
        <p className="auth-foot mono">
          <Link href="/login/reset">Forgot your password?</Link>
        </p>
      </form>
    </AuthCard>
  );
}
