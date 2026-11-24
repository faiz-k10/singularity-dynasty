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
  // ?mode=signup shows only Create Account, ?mode=signin only Sign In (founder, Nov 23 2026: the sign-up gate's Start Free Trial and
  // Sign In buttons each open one); no mode = both, as before. Each mode links to the other in one small line.
  const mode = params?.mode === "signup" || params?.mode === "signin" ? params.mode : null;
  const up = mode !== "signin", inn = mode !== "signup";
  const other = (m) => `/login?mode=${m}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  const title = mode === "signin" ? "Welcome back." : "Claim your orbit.";
  const sub = mode === "signup" ? "Create an account to start your 14 days of Explorer."
    : mode === "signin" ? "Sign in to pick up where you left off."
    : "Create an account to start your 14 days of Explorer, or sign in to pick up where you left off.";

  return (
    <AuthCard title={title} sub={sub} error={params?.error} message={params?.message}>
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
          placeholder="you@email.com"
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
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="feed-input auth-input"
          placeholder="••••••••"
        />

        {up && (
          <>
          <label className="feed-label mono" htmlFor="confirm">
            CONFIRM PASSWORD
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            maxLength={200}
            autoComplete="new-password"
            className="feed-input auth-input"
            placeholder="••••••••"
          />

          <label className="feed-label mono" htmlFor="sleeper">
            SLEEPER USERNAME
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
          </>
        )}

        <BotGuard action="login" />
        <div className="auth-actions">
          {inn && (
            <button formAction={login} className="btn-primary">
              Sign In
            </button>
          )}
          {up && (
            <button formAction={signup} className={mode === "signup" ? "btn-primary" : "btn-ghost"}>
              Create Account
            </button>
          )}
        </div>
        {up && (
          <p className="auth-foot mono">
            New accounts get 14 days of Explorer free, one per Sleeper account. No card needed.
          </p>
        )}
        {/* Shown next to Create Account so agreeing to it is part of signing up (founder, Nov 22 2026): the gambling disclaimer (the full
            text is /disclaimer; don't water it down) and the automatic newsletter subscription. */}
        {up && (
        <p className="auth-legal">
          By creating an account you agree to our <Link href="/terms">Terms</Link> and <Link href="/disclaimer">Disclaimer</Link>.{" "}
          <strong>Dynasty Singularity is not a gambling, betting or wagering service, and none of our content is intended for that use.</strong>{" "}
          Rankings, projections and simulations are for information and entertainment in managing fantasy football rosters; any use of them
          for betting or cash-prize contests is entirely at your own risk. New accounts are automatically signed up for The Singularity
          Drive Newsletter.
        </p>
        )}
        {inn && (
          <p className="auth-foot mono">
            <Link href="/login/reset">Forgot your password?</Link>
          </p>
        )}
        {mode === "signup" && (
          <p className="auth-foot mono">
            Already have an account? <Link href={other("signin")}>Sign in</Link>
          </p>
        )}
        {mode === "signin" && (
          <p className="auth-foot mono">
            New here? <Link href={other("signup")}>Create an account</Link>
          </p>
        )}
      </form>
    </AuthCard>
  );
}
