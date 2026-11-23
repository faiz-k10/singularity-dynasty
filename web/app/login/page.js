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

        <label className="feed-label mono" htmlFor="sleeper">
          SLEEPER USERNAME <span className="auth-hint">(new accounts)</span>
        </label>
        <input
          id="sleeper"
          name="sleeper"
          type="text"
          maxLength={40}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="feed-input auth-input"
          placeholder="your Sleeper name"
        />

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
          New accounts get 14 days of Explorer free, one per Sleeper account. No card needed.
        </p>
        {/* Shown next to Create Account so agreeing to it is part of signing up (founder, Nov 22 2026): the gambling disclaimer (the full
            text is /disclaimer; don't water it down) and the automatic newsletter subscription. */}
        <p className="auth-legal">
          By creating an account you agree to our <Link href="/terms">Terms</Link> and <Link href="/disclaimer">Disclaimer</Link>.{" "}
          <strong>Dynasty Singularity is not a gambling, betting or wagering service, and none of our content is intended for that use.</strong>{" "}
          Rankings, projections and simulations are for information and entertainment in managing fantasy football rosters; any use of them
          for betting or cash-prize contests is entirely at your own risk. New accounts are automatically signed up for The Singularity
          Drive Newsletter.
        </p>
        <p className="auth-foot mono">
          <Link href="/login/reset">Forgot your password?</Link>
        </p>
      </form>
    </AuthCard>
  );
}
