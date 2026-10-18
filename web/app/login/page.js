import { login, signup } from "./actions";
import SiteHeader from "../SiteHeader";

export const metadata = {
  title: "Sign In — Singularity Dynasty",
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error;
  const message = params?.message;
  const next = typeof params?.next === "string" ? params.next : "";

  return (
    <div className="auth-page">
      <SiteHeader />
      <div className="wrap auth-wrap">
        <div className="auth-card reveal in">
          <div className="eyebrow blue">Account</div>
          <h1>Sign in to your orbit.</h1>
          <p className="auth-sub">
            Track your tier, manage your subscription, and pick up where you
            left off.
          </p>

          {error && <p className="auth-error mono">{error}</p>}
          {message && <p className="auth-notice mono">{message}</p>}

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
              minLength={6}
              className="feed-input auth-input"
              placeholder="••••••••"
            />

            <div className="auth-actions">
              <button formAction={login} className="btn-primary">
                Sign In
              </button>
              <button formAction={signup} className="btn-ghost">
                Create Account
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
