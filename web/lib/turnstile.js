// Cloudflare Turnstile (the site's CAPTCHA, Nov 16 2026). Dormant until the founder adds the keys:
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY (the widget, public) and TURNSTILE_SECRET_KEY (server check).
// With no keys the widget renders nothing and every check passes, so nothing breaks before set-up.
// Sign-in, sign-up and password reset hand the token to Supabase Auth (which checks it once captcha is turned on in the
// Supabase dashboard -- a token is single-use, so we never check those ourselves); the newsletter quiz is checked here.
export const TURNSTILE_FIELD = "cf-turnstile-response";

export function turnstileOn() {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(token, ip) {
  if (!turnstileOn()) return true;
  if (!token || typeof token !== "string" || token.length > 4096) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return Boolean(data?.success);
  } catch {
    return false; // Cloudflare unreachable: refuse rather than let bots through (the form says to try again)
  }
}

// A form filled faster than a person can (the page's render time travels in a hidden field). Missing / odd values pass:
// this is a light filter on top of the honeypot, rate limits and Turnstile, never the only gate.
export function tooFast(renderedAt, now = Date.now(), minMs = 2500) {
  const t = Number(renderedAt);
  if (!Number.isFinite(t) || t <= 0) return false;
  return now - t < minMs && now - t >= 0;
}
